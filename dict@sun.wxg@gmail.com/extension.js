// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const GObject = imports.gi.GObject;
const Mainloop = imports.mainloop;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const Tweener = imports.ui.tweener;
const PanelMenu = imports.ui.panelMenu;
const Conf = imports.misc.config;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

const CHECK_CLIPBOARD_TIMEOUT = 500; // milliseconds
const FLAG_DELAY = 1500;

const DICT_SCHEMA = 'org.gnome.shell.extensions.dict';
const HOTKEY = 'hotkey';
const TRIGGER_STATE = 'trigger-state';
const WINDOW_WIDTH = 'window-width';
const WINDOW_HEIGHT = 'window-height';
const ADDRESS_ACTIVE = 'address-active';
const ENABLE_JAVASCRIPT = 'enable-javascript';
const LOAD_IMAGE = 'load-image';
const TOP_ICON = 'top-icon';
const WINDOW_FOLLOW_POINTER = 'window-follow-pointer';
const SHOW_POPUP_WINDOW = 'hotkey-popup-window';

const BUS_NAME = 'org.gnome.Dict';
const OBJECT_PATH = '/org/gnome/Dict';
const DictIface = '<node> \
<interface name="org.gnome.Dict"> \
<method name="translateWords"> \
    <arg type="s" direction="in"/> \
    <arg type="i" direction="in"/> \
    <arg type="i" direction="in"/> \
</method> \
<method name="linkUpdate"> \
    <arg type="s" direction="in"/> \
    <arg type="b" direction="in"/> \
    <arg type="b" direction="in"/> \
</method> \
<method name="windowSize"> \
    <arg type="i" direction="in"/> \
    <arg type="i" direction="in"/> \
</method> \
<method name="closeDict"/> \
<method name="hideDict"> \
    <arg type="s" direction="in"/> \
</method> \
<signal name="windowSizeChanged"> \
    <arg type="u"/> \
    <arg type="u"/> \
</signal> \
</interface> \
</node>';
const DictProxy = Gio.DBusProxy.makeProxyWrapper(DictIface);

const DBusIface = '<node> \
<interface name="org.freedesktop.DBus"> \
<method name="GetNameOwner"> \
    <arg type="s" direction="in"/> \
    <arg type="s" direction="out"/> \
</method> \
</interface> \
</node>';
const DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusIface);

function isLess30() {
    let version = Conf.PACKAGE_VERSION.split('.');
    if (version[0] == 3 && version[1] < 30)
        return true;

    return false;
}

class Flag {
    constructor() {
        this.dictProxy = new DictProxy(Gio.DBus.session, BUS_NAME, OBJECT_PATH);
        this.dbusProxy = new DBusProxy(Gio.DBus.session,
                                       'org.freedesktop.DBus',
                                       '/org/freedesktop/DBus');

        this.dictProxy.connectSignal('windowSizeChanged', this.windowSizeChanged.bind(this));

        this._gsettings = Convenience.getSettings(DICT_SCHEMA);

        this.windowFollowPointer = this._gsettings.get_boolean(WINDOW_FOLLOW_POINTER);
        this.windowFollowPointerID = this._gsettings.connect("changed::" + WINDOW_FOLLOW_POINTER, () => {
            this.windowFollowPointer = this._gsettings.get_boolean(WINDOW_FOLLOW_POINTER);
        });

        this.addressListId = this._gsettings.connect("changed::" + ADDRESS_ACTIVE,
                                                     this.updateLink.bind(this));
        this.addressListId = this._gsettings.connect("changed::" + ENABLE_JAVASCRIPT,
                                                     this.updateLink.bind(this));
        this.addressListId = this._gsettings.connect("changed::" + LOAD_IMAGE,
                                                     this.updateLink.bind(this));

        try {
            this.dbusProxy.GetNameOwnerSync('org.gnome.Dict');
        } catch (e) {
            this.createDict();
        }

        this.updateLink();

        this.trigger = this._gsettings.get_boolean(TRIGGER_STATE);

        this.actor = new St.BoxLayout({ reactive: true,
                                    can_focus: true,
                                    track_hover: true});
        this.actor.hide();

        let gicon = new Gio.FileIcon({
                    file: Gio.File.new_for_path(Me.path + '/icons/flag.png') });
        let icon = new St.Icon({ gicon: gicon,
                                 icon_size: 32 });

        let button= new St.Button({ style_class: 'panel-button',
                                    reactive: true,
                                    can_focus: true,
                                    track_hover: true,
                                    child: icon });
        button.connect("clicked", this.flagClick.bind(this));
        this.actor.add_actor(button);

        Main.layoutManager.addChrome(this.actor);

        this.text = "welcome";
        this.oldText = "welcome";

        this.checkStClipboardId = 0;
        this.checkClipboardId = 0;
        this._flagWatchId = 0;

        this.stClipboard = St.Clipboard.get_default();
        this.checkStClipboardId = Mainloop.timeout_add(CHECK_CLIPBOARD_TIMEOUT,
                                                       this.checkStClipboard.bind(this));
        GLib.Source.set_name_by_id(this.checkStClipboardId, '[gnome-shell] this.checkStClipboardId');
/*
        if (Meta.is_wayland_compositor()) {
            this.stClipboard = St.Clipboard.get_default();
            this.checkStClipboardId = Mainloop.timeout_add(CHECK_CLIPBOARD_TIMEOUT,
                                                           this.checkStClipboard.bind(this));
            GLib.Source.set_name_by_id(this.checkStClipboardId, '[gnome-shell] this.checkStClipboardId');
        } else {
            if (isLess30()){
                let display = Gdk.Display.get_default();
                this.clipboard = Gtk.Clipboard.get_default(display);
            } else {
                this.clipboard = Gtk.Clipboard.get('PRIMARY');
            }
            this.checkClipboardId = this.clipboard.connect("owner-change", this.checkClipboard.bind(this));
        }
*/

        this.windowCenter = false;

        this.windowCreatedId = global.display.connect('window-created', (display, window) => {
            if (window.title == 'Dict')
                this.moveWindow(window);
        });

        this.restackedId = global.display.connect('restacked', () => {
            let windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
            for (let i = 0; i < windows.length; i++) {
                if (windows[i].title == 'Dict')
                    this.moveWindow(windows[i]);
            }
        });

        this.removeNotificaionId = global.display.connect('window-demands-attention',
                                                          this._onWindowDemandsAttention.bind(this));

        this.addKeybinding();
    }

    checkStClipboard() {
        this.stClipboard.get_text(St.ClipboardType.PRIMARY,
            (clipboard, text) => {
                if (!text)
                    return;

                this.text = text;
                if (this.text != this.oldText) {
                    this.oldText = this.text;
                    this.showFlag();
                }
            });

        return GLib.SOURCE_CONTINUE;
    }

    checkClipboard(clipboard, event) {
        let text = this.clipboard.wait_for_text();
        if (!text)
            return;

        this.text = text;
        if (this.text != this.oldText) {
            this.oldText = this.text;
            this.showFlag();
        }
    }

    getText(clipBoard, text) {
        this.text = text;
    }

    flagClick() {
        if (this._flagWatchId) {
            Mainloop.source_remove(this._flagWatchId);
            this._flagWatchId = 0;
        }

        this.actor.hide();

        if (this.text != null)
            this.showDict();
    }

    showDict() {
        try {
            this.dbusProxy.GetNameOwnerSync('org.gnome.Dict');
        } catch (e) {
            this.createDict();
            let [x, y, mod] =global.get_pointer();
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                this.dictProxy.translateWordsRemote(this.text, x, y);
                return GLib.SOURCE_REMOVE});

            return;
        }

        this.windowCenter = false;
        let [x, y, mod] =global.get_pointer();
        this.dictProxy.translateWordsRemote(this.text, x, y);
    }

    moveWindow(window) {
        if (!this.windowFollowPointer)
            return;

        let currentWorkspace = this.getWM().get_active_workspace();
        window.change_workspace(currentWorkspace);
        let [x, y] = this.windowCenter ? this.moveToCenter(window) : this.moveToPosition(window);
        window.move_frame(false, x, y);
    }

    moveToCenter(window) {
        let workarea = window.get_work_area_current_monitor();
        let frame = window.get_frame_rect();

        let windowX = workarea.x + (workarea.width / 2) - (frame.width / 2);
        let windowY = workarea.y + (workarea.height / 2) - (frame.height / 2);

        return [Math.floor(windowX), Math.floor(windowY)];
    }

    moveToPosition(window) {
        let workarea = window.get_work_area_current_monitor();

        let windowX, windowY;
        let [x, y, mod] =global.get_pointer();
        let frame = window.get_frame_rect();
        if ((x + frame.width) <= (workarea.x + workarea.width)) {
            windowX = x;
        } else {
            windowX = x - frame.width;
            if (windowX < 0)
                windowX = 0;
        }

        if (((y - frame.height / 2) >= workarea.y) && ((y + frame.height / 2) <= (workarea.y + workarea.height))) {
            windowY = y - frame.height / 2;
        } else if ((y - frame.height / 2) < workarea.y) {
            windowY = workarea.y;
        } else {
            windowY = workarea.y + workarea.height - frame.height;
        }

        return [Math.floor(windowX), Math.floor(windowY)];
    }

    createDict() {
        let process = Gio.SubprocessLauncher.new(Gio.SubprocessFlags.INHERIT_FDS);
        process.set_flags(Gio.SubprocessFlags.INHERIT_FDS);
        process.spawnv([Me.imports.searchPath + '/dict.js']);
    }

    showFlag() {
        if (!this.trigger)
            return;

        let [x, y, mod] =global.get_pointer();

        if ((y - 50) < 0)
            y = y + 10;
        else
            y = y - 50;

        this.actor.set_position(x + 10, y);

        //Main.uiGroup.set_child_above_sibling(this.actor, null);
        this.actor.show();

        if (this._flagWatchId) {
            Mainloop.source_remove(this._flagWatchId);
            this._flagWatchId = 0;
        }

        this._flagWatchId = Mainloop.timeout_add(FLAG_DELAY, () => {
            this.actor.hide();
            this._flagWatchId = 0;
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._flagWatchId, '[gnome-shell] this._setPointerVisible');
    }

    _onWindowDemandsAttention(display, window) {
        Main.activateWindow(window);
    }

    hideDict() {
        try {
            this.dbusProxy.GetNameOwnerSync('org.gnome.Dict');
        } catch (e) {
            this.createDict();
            Mainloop.timeout_add(1000, () => {
                this.dictProxy.hideDictRemote(this.text);
                return GLib.SOURCE_REMOVE});
            return;
        }

        this.dictProxy.hideDictRemote(this.text);
    }

    updateLink() {
        this.link = this._gsettings.get_string(ADDRESS_ACTIVE);
        this.enableJS = this._gsettings.get_boolean(ENABLE_JAVASCRIPT);
        this.loadImage = this._gsettings.get_boolean(LOAD_IMAGE);

        this.dictProxy.linkUpdateRemote(this.link, this.enableJS, this.loadImage);
    }

    windowSizeChanged(proxy, senderName, [width, height]) {
        this._gsettings.set_int(WINDOW_WIDTH, width);
        this._gsettings.set_int(WINDOW_HEIGHT, height);
    }

    addKeybinding() {
        let ModeType = Shell.hasOwnProperty('ActionMode') ?
                       Shell.ActionMode : Shell.KeyBindingMode;

        Main.wm.addKeybinding(HOTKEY,
                              this._gsettings,
                              Meta.KeyBindingFlags.NONE,
                              ModeType.ALL,
                              () => { this.trigger = !this.trigger;
                                      this._gsettings.set_boolean(TRIGGER_STATE, this.trigger);
                              });
        Main.wm.addKeybinding(SHOW_POPUP_WINDOW,
                              this._gsettings,
                              Meta.KeyBindingFlags.NONE,
                              ModeType.ALL,
                              () => {
                                  if (this.text == null)
                                      this.text = "";
                                  this.windowCenter = true;
                                  this.hideDict();
                              });
    }

    getWM() {
        if (global.screen)
            return global.screen;
        else
            return global.workspace_manager;
    }

    destroy(){
        Main.wm.removeKeybinding(HOTKEY);
        Main.wm.removeKeybinding(SHOW_POPUP_WINDOW);

        if (this._flagWatchId) {
            Mainloop.source_remove(this._flagWatchId);
            this._flagWatchId = 0;
        }

        Main.layoutManager.removeChrome(this.actor);

        if (this.checkClipboardId != 0) {
            this.clipboard.disconnect(this.checkClipboardId);
            this.checkClipboardId = 0;
        }
        if (this.checkStClipboardId != 0) {
            Mainloop.source_remove(this.checkStClipboardId);
            this.checkStClipboardId = 0;
        }
        if (this.windowCreatedId != 0) {
            global.display.disconnect(this.windowCreatedId);
            this.windowCreatedId = 0;
        }
        if (this.restackedId != 0) {
            global.display.disconnect(this.restackedId);
            this.restackedId = 0;
        }
        if (this.removeNotificaionId != 0) {
            global.display.disconnect(this.removeNotificaionId);
            this.removeNotificaionId = 0;
        }
        if (this.addressListId != 0) {
            this._gsettings.disconnect(this.addressListId);
            this.addressListId = 0;
        }
        if (this.windowFollowPointerID != 0) {
            this._gsettings.disconnect(this.windowFollowPointerID);
            this.windowFollowPointerID = 0;
        }

        try {
            this.dbusProxy.GetNameOwnerSync('org.gnome.Dict');
        } catch (e) {
            return;
        }
        //this.dictProxy.closeDictRemote();
    }
}

var MenuButton = GObject.registerClass(
class MenuButton extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('Dict flag'));

        this._gsettings = Convenience.getSettings(DICT_SCHEMA);
        this.dictActive = false;

        let gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(Me.path + '/icons/dict.png') });
        this.iconEnable = new St.Icon({ gicon: gicon,
                                 style_class: 'system-status-icon' });

        gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(Me.path + '/icons/dict-disable.png') });
        this.iconDisable = new St.Icon({ gicon: gicon,
                                 style_class: 'system-status-icon' });

        this._addIcon();
        this._showIcon();

        this.connect('button-press-event', this._onButtonPress.bind(this));

        this.iconId = this._gsettings.connect('changed::' + TRIGGER_STATE, this._addIcon.bind(this));
        this.showIconId = this._gsettings.connect('changed::' + TOP_ICON, this._showIcon.bind(this));
    }

    _addIcon() {
        let trigger = this._gsettings.get_boolean(TRIGGER_STATE);
        if (trigger) {
            this.remove_child(this.iconDisable);
            this.add_child(this.iconEnable);
        } else {
            this.remove_child(this.iconEnable);
            this.add_child(this.iconDisable);
        }
    }

    _showIcon() {
        let showIcon = this._gsettings.get_boolean(TOP_ICON);
        this.visible = showIcon;
    }

    _onButtonPress(actor, event) {
        flag.windowCenter = true;
        flag.hideDict();
    }

    destroy() {
        this._gsettings.disconnect(this.iconId);
        this._gsettings.disconnect(this.showIconId);

        super.destroy();
    }
});

let flag;
let menuButton;

function init(metadata) {
}

function enable() {
    flag = new Flag();
    menuButton = new MenuButton();
    Main.panel.addToStatusArea('flag', menuButton);
}

function disable() {
    flag.destroy();
    flag = null;

    menuButton.destroy();
    menuButton = null;
}
