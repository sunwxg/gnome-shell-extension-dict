#!/usr/bin/gjs

imports.gi.versions.Gio = '2.0';
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.WebKit2 = '4.1';

const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const System = imports.system;
const GLib = imports.gi.GLib;
const Webkit = imports.gi.WebKit2;

imports.searchPath.push(GLib.path_get_dirname(System.programInvocationName));
const Util = imports.util;
const History = imports.history.History;
const Store = imports.store.Store;

const DBusIface = '<node> \
<interface name="org.freedesktop.DBus"> \
<method name="GetNameOwner"> \
    <arg type="s" direction="in"/> \
    <arg type="s" direction="out"/> \
</method> \
</interface> \
</node>';
const DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusIface);

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
<signal name="pinned"> \
    <arg type="b"/> \
</signal> \
<property name="Pin" type="b" access="readwrite"/> \
</interface> \
</node>';

const DICT_SCHEMA = 'org.gnome.shell.extensions.dict';
const HOTKEY = 'hotkey';
const TRIGGER_STATE = 'trigger-state';
const WINDOW_WIDTH = 'window-width';
const WINDOW_HEIGHT = 'window-height';
const ADDRESS_ACTIVE = 'address-active';
const MOBILE_AGENT = 'mobile-agent';
const ENABLE_JAVASCRIPT = 'enable-javascript';
const LOAD_IMAGE = 'load-image';
const TOP_ICON = 'top-icon';
const ENABLE_TRANSLATE_SHELL = 'enable-translate-shell';
const LANGUAGE = 'language';
const ENABLE_WEB = 'enable-web';

const USER_AGENT = "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Mobile Safari/537.36";

class Dict {
    constructor(words) {
        this.mobileAgent = false;
        this.enableJS = false;
        this.loadImage = false;
        this.active = false;

        if (words != null)
            this.words = words;
        else
            this.words = 'welcome';

        this._gsettings = Util.getSettings(DICT_SCHEMA);

        this.path = GLib.path_get_dirname(System.programInvocationName);


        this.enableTransShell = this._gsettings.get_boolean(ENABLE_TRANSLATE_SHELL);
        this.enableTransShellId = this._gsettings.connect("changed::" + ENABLE_TRANSLATE_SHELL,
                                                          this._updateNoteBook.bind(this));

        this.mobileAgent = this._gsettings.get_boolean(MOBILE_AGENT);
        this.mobileAgentId = this._gsettings.connect("changed::" + MOBILE_AGENT,
                                                  () => { this._update(); });

        this.enableJS = this._gsettings.get_boolean(ENABLE_JAVASCRIPT);
        this.enableJSId = this._gsettings.connect("changed::" + ENABLE_JAVASCRIPT,
                                                  () => { this._update(); });

        this.loadImage = this._gsettings.get_boolean(LOAD_IMAGE);
        this.loadImageId = this._gsettings.connect("changed::" + LOAD_IMAGE,
                                                  () => { this._update(); });

        this.url = this._gsettings.get_string(ADDRESS_ACTIVE);
        this.addressId = this._gsettings.connect("changed::" + ADDRESS_ACTIVE,
                                                  () => { this._update(); });

        this.language = this._gsettings.get_string(LANGUAGE);
        this.languageId = this._gsettings.connect("changed::" + LANGUAGE,
                                                  () => { this.language = this._gsettings.get_string(LANGUAGE); });

        this.enableWeb = this._gsettings.get_boolean(ENABLE_WEB);
        this.enableWebId = this._gsettings.connect("changed::" + ENABLE_WEB,
                                                   this._updateNoteBook.bind(this));

        this.application = new Gtk.Application({application_id: "org.gnome.Dict"});
        this.application.connect('activate', this._onActivate.bind(this));
        this.application.connect('startup', this._onStartup.bind(this));

        this._impl = Gio.DBusExportedObject.wrapJSObject(DictIface, this);
        this._impl.export(Gio.DBus.session, '/org/gnome/Dict');
        Gio.DBus.session.own_name('org.gnome.Dict',
                                  Gio.BusNameOwnerFlags.REPLACE,
                                  null, null);
    }

    _onActivate() {
        this.window.show_all();
    }

    _onStartup() {
        this._buildUI ();
    }

    _buildUI() {
        this.window = new Gtk.ApplicationWindow({ application: this.application,
                                                   window_position: Gtk.WindowPosition.CENTER,
                                                   title: 'Dict',
                                                   border_width: 1 });

        this.window.set_icon_from_file(this.path + '/icons/flag.png');

        this.focusOutId = this.window.connect('focus-out-event', this._mouseLeave.bind(this));
        //this.window.connect('enter-notify-event', this._mouseMotion.bind(this));
        //this.window.connect('leave-notify-event', this._mouseLeave.bind(this));
        this.window.set_events(Gdk.EventMask.ALL_EVENTS_MASK);
        this.window.connect('configure-event', this.windowSizeChanged.bind(this));

        this.window.set_resizable(true);
        this.width = this._gsettings.get_int(WINDOW_WIDTH);
        this.height = this._gsettings.get_int(WINDOW_HEIGHT);
        this.window.resize(this.width, this.height);

        this.builder = new Gtk.Builder();
        this.builder.add_from_file(this.path + '/dict.ui');
        this.window.set_titlebar(this.builder.get_object('header_bar'));

        let searchButton = this.builder.get_object('search_button');
        searchButton.connect('toggled', this.searchToggled.bind(this));

        this.historyButton = this.builder.get_object('history_button');
        this.historyButton.connect('toggled', this.historyToggled.bind(this));

        this.pinToggleButton = this.builder.get_object('pin_button');
        this.pinToggleButton.connect('toggled', this.pinToggled.bind(this));

        let configButton = this.builder.get_object('config_button');
        configButton.connect('clicked', this.configOpen.bind(this));

        this.searchEntry = this.builder.get_object('search_entry');
        this.searchEntry.set_no_show_all(true);
        this.searchEntry.connect('activate', this.searchEntryActivate.bind(this));

        let hbox = this.builder.get_object('horizontal_box');
        this.history = new History();
        hbox.pack1(this.history.historyBox, false, false);
        this.history.connect("selectChanged", this.historySelectChanged.bind(this));
        this.history.connect("deleteWord", this.historyDeleteWord.bind(this));

        this.notebook = new Gtk.Notebook({});
        hbox.pack2(this.notebook, true, false);

        this.window.add(this.builder.get_object('vertical_box'));

        this.store = new Store();
        this.createTranslateView();
        this._updateNoteBook();
    }

    createTranslateView() {
        this.shell = new Gtk.Label();
        this.shell.set_xalign(0);
        this.shell.set_yalign(0);
        this.shell.set_selectable(true);
        let scroll_window = new Gtk.ScrolledWindow({ expand: true });
        scroll_window.add(this.shell);
        this.shell.scroll_window = scroll_window;

        let cacheDir = '/run/dict';
        let manager = new Webkit.WebsiteDataManager({base_cache_directory:                cacheDir,
                                                     base_data_directory:                 cacheDir,
                                                     disk_cache_directory:                cacheDir,
                                                     indexeddb_directory:                 cacheDir,
                                                     local_storage_directory:             cacheDir,
                                                     offline_application_cache_directory: cacheDir,
                                                     websql_directory:                    cacheDir});

        let context = Webkit.WebContext.new_with_website_data_manager(manager);
        context.get_cookie_manager().set_accept_policy(Webkit.CookieAcceptPolicy.ALWAYS);
        this.web_view = Webkit.WebView.new_with_context(context);
        let settings = this.web_view.get_settings();
        settings.set_enable_page_cache(false);
        settings.set_enable_offline_web_application_cache(false);
        settings.set_enable_javascript(this.enableJS);
        settings.set_auto_load_images(this.loadImage);
        this._setMobileAgent();
        this.web_view.set_settings(settings);

        this.web_view.load_uri(this._getUrl());
    }

    searchToggled(button) {
        this.searchEntry.visible = button.get_active();
        this.searchEntry.grab_focus_without_selecting();
    }

    searchEntryActivate(entry) {
        this._translateWords(entry.get_text(), null, null, true);
    }

    historyToggled(button) {
        if (button.get_active()) {
            this.history.historyBox.visible = button.get_active();
            let [width, height] = this.window.get_size();
            let [boxWidth, ] = this.history.historyBox.get_preferred_width();
            this.window.resize(width + boxWidth, height);
        } else {
            let [width, height] = this.window.get_size();
            let [boxWidth, ] = this.history.historyBox.get_preferred_width();
            this.window.resize(width - boxWidth, height);
            this._gsettings.set_int(WINDOW_WIDTH, width - boxWidth);
            this.history.historyBox.visible = button.get_active();
        }
    }

    historySelectChanged(history, word) {
        this._translateWords(word, null, null, false);
    }

    historyDeleteWord(history, word) {
        this.store.removeWord(word);
    }

    windowSizeChanged() {
        let [width, height] = this.window.get_size();
        if (this.width != width || this.height != height) {
            this.width = width;
            this.height = height;
            this._gsettings.set_int(WINDOW_WIDTH, width);
            this._gsettings.set_int(WINDOW_HEIGHT, height);
            //this._impl.emit_signal('windowSizeChanged', GLib.Variant.new('(uu)', [width, height]));
        }
    }

    pinToggled(button) {
        if (button.get_active()) {
            if (this.focusOutId) {
                this.window.disconnect(this.focusOutId);
                this.focusOutId = 0;
            }
        } else {
            if (!this.focusOutId)
                this.focusOutId = this.window.connect('focus-out-event', this._mouseLeave.bind(this));
        }
        this._impl.emit_signal('pinned', GLib.Variant.new('(b)', [button.get_active()]));
    }

    configOpen() {
        let [, argv] = GLib.shell_parse_argv('gnome-shell-extension-prefs ' + 'dict@sun.wxg@gmail.com');

        let [success, pid] = GLib.spawn_async(null, argv, null,
                                              GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
                                              null);
        if (success)
            GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => { this.hideDict(null); });
    }

    _mouseMotion(widget, event) {
    }

    _mouseLeave(widget, event) {
        this.historyButton.set_active(false);
        this.window.hide();
        this.active = false;
    }

    _getUrl(words) {
        let url;
        if (words)
            url = this.url.replace("%WORD", words);
        else
            url = this.url.replace("%WORD", '');

        return url;
    }

    _shellTranslateWord() {
        let word = this.words.replace(/[^a-zA-Z\-]/g, ' ')
        word = word.split(' ');
        word = word[0].toLowerCase();
        let index = this.store.findInDB(word);
        if (index != null) {
            let text = this.store.getText(index);
            this.shell.set_markup(text);
            return;
        }

        let cmd = "trans -t " + this.language + " --show-languages n --no-ansi " + word;
        try {
            let [result, stdout, stderr, status] = GLib.spawn_command_line_sync(cmd);

            let text = Utf8ArrayToStr(stdout);

            this.shell.set_markup(text);
            this.store.addWord(word, text);
        } catch (e) {
            this.shell.set_text("Error: " + e.message);
        }
    }

    _updateNoteBook() {
        this.enableTransShell = this._gsettings.get_boolean(ENABLE_TRANSLATE_SHELL);
        this.enableWeb = this._gsettings.get_boolean(ENABLE_WEB);

        this.notebook.remove(this.web_view);
        this.notebook.remove(this.shell.scroll_window);

        let label;
        if (this.enableTransShell) {
            label = new Gtk.Label();
            label.set_text('translate shell');
            this.notebook.append_page(this.shell.scroll_window, label);
            this.notebook.child_set_property(this.shell.scroll_window, 'tab-expand', true);
        }

        if (this.enableWeb) {
            label = new Gtk.Label();
            label.set_text('web');
            this.notebook.append_page(this.web_view, label);
            this.notebook.child_set_property(this.web_view, 'tab-expand', true);
            this.web_view.set_can_focus(this.enableTransShell ? false : true);
        }

        if (this.notebook.get_n_pages() < 1) {
            this.notebook.add(this.shell.scroll_window);
            this.shell.set_text('');
        }

        if (this.notebook.get_n_pages() < 2)
            this.notebook.set_show_tabs(false);
        else
            this.notebook.set_show_tabs(true);
    }

    get Pin() {
        return this.pinToggleButton.get_active();
    }

    translateWords(words, x, y) {
        this.searchEntry.set_text("");
        this._translateWords(words, x, y, true);
    }

    _translateWords(words, x, y, addToHistory = true) {
        let oldWord = this.words;
        this.words = words == "" ? 'welcome' : words;

        if (this.enableWeb && oldWord != words) {
            this.web_view.load_uri(this._getUrl(this.words));
        }

        if (this.enableTransShell)
            this._shellTranslateWord();

        if (addToHistory) {
            this.history.addWord(words);
        }

        this.notebook.prev_page();
        this.window.show_all();
        this.active = true;
    }

    _setMobileAgent() {
        let settings = this.web_view.get_settings();
        if (this.mobileAgent)
            settings.set_user_agent(USER_AGENT);
        else
            settings.set_user_agent(null);
    }

    _update() {
        let settings = this.web_view.get_settings();

        this.url = this._gsettings.get_string(ADDRESS_ACTIVE);

        this.mobileAgent = this._gsettings.get_boolean(MOBILE_AGENT);
        this._setMobileAgent();

        this.enableJS = this._gsettings.get_boolean(ENABLE_JAVASCRIPT);
        settings.set_enable_javascript(this.enableJS);

        this.loadImage = this._gsettings.get_boolean(LOAD_IMAGE);
        settings.set_auto_load_images(this.loadImage);

        this.web_view.set_settings(settings);
    }

    windowSize(width, height) {
        this.window.resize(width, height);
    }

    closeDict() {
        this.application.quit();
    }

    hideDict(text) {
        if (this.focusOutId == 0)
            return;

        if (this.active) {
            this.active = false;
            this.historyButton.set_active(false);
            this.window.hide();
        } else {
            if (this.searchEntry.visible) {
                this.searchEntry.set_text("");
                this.searchEntry.grab_focus_without_selecting();
            }
            let words = text ? text : "";
            this._translateWords(words, null, null, false);
        }
    }
};

function Utf8ArrayToStr(array) {
    let out, i, len, c;
    let char2, char3;

    out = "";
    len = array.length;
    i = 0;
    while (i < len) {
        c = array[i++];
        switch (c >> 4)
        {
            case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
                // 0xxxxxxx
                out += String.fromCharCode(c);
                break;
            case 12: case 13:
                // 110x xxxx   10xx xxxx
                char2 = array[i++];
                out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
                break;
            case 14:
                // 1110 xxxx  10xx xxxx  10xx xxxx
                char2 = array[i++];
                char3 = array[i++];
                out += String.fromCharCode(((c & 0x0F) << 12) |
                        ((char2 & 0x3F) << 6) |
                        ((char3 & 0x3F) << 0));
                break;
        }
    }
    return out;
}

let words = null;

if (ARGV.length > 0) {
    words = ARGV[0];
    for (let i = 1; i < ARGV.length; i++)
        words = words + '%20' + ARGV[i];
}

let dbusProxy = new DBusProxy(Gio.DBus.session,
                              'org.freedesktop.DBus',
                              '/org/freedesktop/DBus');
try {
    dbusProxy.GetNameOwnerSync('org.gnome.Dict');
} catch (e) {
    let app = new Dict(words);
    app.application.run(ARGV);
}
