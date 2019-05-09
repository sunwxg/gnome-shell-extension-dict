// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const Tweener = imports.ui.tweener;
const PanelMenu = imports.ui.panelMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

const CHECK_CLIPBOARD_TIMEOUT = 500; // milliseconds
const FLAG_DELAY = 1500;

const DICT_SCHEMA = 'org.gnome.shell.extensions.dict';
const WINDOW_WIDTH = 'window-width';
const WINDOW_HEIGHT = 'window-height';
const ADDRESS_ACTIVE = 'address-active';
const ENABLE_JAVASCRIPT = 'enable-javascript';
const LOAD_IMAGE = 'load-image';

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
<method name="hideDict"/> \
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

class Flag {
    constructor() {
        this.dictProxy = new DictProxy(Gio.DBus.session, BUS_NAME, OBJECT_PATH);
        this.dbusProxy = new DBusProxy(Gio.DBus.session,
                                       'org.freedesktop.DBus',
                                       '/org/freedesktop/DBus');

        this.dictProxy.connectSignal('windowSizeChanged', this.windowSizeChanged.bind(this));

        this._gsettings = Convenience.getSettings(DICT_SCHEMA);
        this.addressListId = this._gsettings.connect("changed::" + ADDRESS_ACTIVE,
                                                     this.updateLink.bind(this));
        this.addressListId = this._gsettings.connect("changed::" + ENABLE_JAVASCRIPT,
                                                     this.updateLink.bind(this));
        this.addressListId = this._gsettings.connect("changed::" + LOAD_IMAGE,
                                                     this.updateLink.bind(this));
        this.updateLink();

        try {
            this.dbusProxy.GetNameOwnerSync('org.gnome.Dict');
        } catch (e) {
            this.createDict();
        }

        this.actor = new St.BoxLayout({ reactive: true,
                                    can_focus: true,
                                    track_hover: true});
        this.actor.hide();

        let gicon = new Gio.FileIcon({
                    file: Gio.File.new_for_path(Me.path + '/icons/flag.png') });
        let icon = new St.Icon({ gicon: gicon,
                                 icon_size: 32 });

        let button= new St.Button({ style_class: 'window-button',
                                    reactive: true,
                                    can_focus: true,
                                    track_hover: true,
                                    child: icon });
        button.connect("clicked", this.flagClick.bind(this));
        this.actor.add_actor(button);

        Main.layoutManager.addChrome(this.actor);

        this.text = null;
        this.oldText = null;

        this.checkStClipboardId = 0;
        this.checkClipboardId = 0;
        this._flagWatchId = 0;

        if (Meta.is_wayland_compositor()) {
            this.stClipboard = St.Clipboard.get_default();
            this.checkStClipboardId = Mainloop.timeout_add(CHECK_CLIPBOARD_TIMEOUT,
                                                           this.checkStClipboard.bind(this));
            GLib.Source.set_name_by_id(this.checkStClipboardId, '[gnome-shell] this.checkStClipboardId');
        } else {
            let display = Gdk.Display.get_default();
            this.clipboard = Gtk.Clipboard.get_default(display);
            this.checkClipboardId = this.clipboard.connect("owner-change", this.checkClipboard.bind(this));
        }

        this.removeNotificaionId = global.display.connect('window-demands-attention',
                                                          this._onWindowDemandsAttention.bind(this));
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
            Mainloop.timeout_add(1000, () => {
                this.dictProxy.translateWordsRemote(this.text, x, y);
                return GLib.SOURCE_REMOVE});
            return;
        }

        let [x, y, mod] =global.get_pointer();
        this.dictProxy.translateWordsRemote(this.text, x, y);

        let currentWorkspace = this.getWM().get_active_workspace();
        let windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
        for (let i = 0; i < windows.length; i++) {
            if (windows[i].title == 'Dict') {
                windows[i].change_workspace(currentWorkspace);
                windows[i].activate(global.get_current_time());
            }
        }
    }

    createDict() {
        Gio.Subprocess.new([Me.imports.searchPath + '/dict.js'],
                           Gio.SubprocessFlags.INHERIT_FDS);

        Mainloop.timeout_add(500, () => {
            this.dictProxy.linkUpdateRemote(this.link, this.enableJS, this.loadImage);

            let width = this._gsettings.get_int(WINDOW_WIDTH);
            let height = this._gsettings.get_int(WINDOW_HEIGHT);
            this.dictProxy.windowSizeRemote(width, height);

            return GLib.SOURCE_REMOVE;
        });
    }

    showFlag() {
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
                this.dictProxy.hideDictRemote();
                return GLib.SOURCE_REMOVE});
            return;
        }

        this.dictProxy.hideDictRemote();
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

    getWM() {
        if (global.screen)
            return global.screen;
        else
            return global.workspace_manager;
    }

    destroy(){
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
        if (this.removeNotificaionId != 0) {
            global.display.disconnect(this.removeNotificaionId);
            this.removeNotificaionId = 0;
        }
        if (this.addressListId !=0) {
            this._gsettings.disconnect(this.addressListId);
            this.addressListId = 0;
        }

        try {
            this.dbusProxy.GetNameOwnerSync('org.gnome.Dict');
        } catch (e) {
            return;
        }
        this.dictProxy.closeDictRemote();
    }
}

class MenuButton extends PanelMenu.Button {
    constructor() {
        super(0.0, _("Flag"));

        this.dictActive = false;

        let gicon = new Gio.FileIcon({
                    file: Gio.File.new_for_path(Me.path + '/icons/flag.png') });
        let icon = new St.Icon({ gicon: gicon,
                                 style_class: 'system-status-icon' });
        this.actor.add_child(icon);

        this.actor.connect('button-press-event', this._onButtonPress.bind(this));
    }

    _onButtonPress(actor, event) {
        flag.hideDict();
    }
}

let flag;
let menuButton;

function init(metadata) {
    let theme = imports.gi.Gtk.IconTheme.get_default();
    theme.append_search_path(metadata.path + '/icons');
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
