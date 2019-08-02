#!/usr/bin/gjs

const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const System = imports.system;
const GLib = imports.gi.GLib;
const Webkit = imports.gi.WebKit2;

imports.searchPath.push(GLib.path_get_dirname(System.programInvocationName));
const Util = imports.util;

const WEB_SITE = 'https://translate.google.com/#view=home&op=translate&sl=auto&tl=auto&text=%WORD';

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

const DICT_SCHEMA = 'org.gnome.shell.extensions.dict';
const HOTKEY = 'hotkey';
const TRIGGER_STATE = 'trigger-state';
const WINDOW_WIDTH = 'window-width';
const WINDOW_HEIGHT = 'window-height';
const ADDRESS_ACTIVE = 'address-active';
const ENABLE_JAVASCRIPT = 'enable-javascript';
const LOAD_IMAGE = 'load-image';
const TOP_ICON = 'top-icon';
const ENABLE_TRANSLATE_SHELL = 'enable-translate-shell';
const LANGUAGE = 'language';
const ENABLE_WEB = 'enable-web';

class Dict {
    constructor(words) {
        this.enableJS = false;
        this.loadImage = false;
        this.active = false;

        if (words != null)
            this.words = words;
        else
            this.words = 'welcome';

        this._gsettings = Util.getSettings(DICT_SCHEMA);

        this.path = GLib.path_get_dirname(System.programInvocationName);

        this.loadHistory();

        this.application = new Gtk.Application({application_id: "org.gnome.Dict"});
        this.application.connect('activate', this._onActivate.bind(this));
        this.application.connect('startup', this._onStartup.bind(this));

        this._impl = Gio.DBusExportedObject.wrapJSObject(DictIface, this);
        this._impl.export(Gio.DBus.session, '/org/gnome/Dict');
        Gio.DBus.session.own_name('org.gnome.Dict',
                                  Gio.BusNameOwnerFlags.REPLACE,
                                  null, null);

        this.enableTransShell = this._gsettings.get_boolean(ENABLE_TRANSLATE_SHELL);
        this.enableTransShellId = this._gsettings.connect("changed::" + ENABLE_TRANSLATE_SHELL,
                                                          this._updateNoteBook.bind(this));

        this.enableJS = this._gsettings.get_boolean(ENABLE_JAVASCRIPT);
        this.enableJSId = this._gsettings.connect("changed::" + ENABLE_JAVASCRIPT,
                                                  () => { this.enableJS= this._gsettings.get_boolean(ENABLE_JAVASCRIPT); });

        this.loadImage = this._gsettings.get_boolean(LOAD_IMAGE);
        this.loadImageId = this._gsettings.connect("changed::" + LOAD_IMAGE,
                                                  () => { this.loadImage= this._gsettings.get_boolean(LOAD_IMAGE); });

        this.language = this._gsettings.get_string(LANGUAGE);
        this.languageId = this._gsettings.connect("changed::" + LANGUAGE,
                                                  () => { this.language = this._gsettings.get_string(LANGUAGE); });
        this.url = "https://translate.google.com/#view=home&op=translate&sl=auto&tl=" + this.language + "&text=%WORD";

        this.enableWeb = this._gsettings.get_boolean(ENABLE_WEB);
        this.enableWebId = this._gsettings.connect("changed::" + ENABLE_WEB,
                                                   this._updateNoteBook.bind(this));
    }

    _onActivate() {
        //this.window.show_all();
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
        this.window.set_size_request(this.width, this.height);

        this.builder = new Gtk.Builder();
        this.builder.add_from_file(this.path + '/dict.ui');
        this.window.set_titlebar(this.builder.get_object('header_bar'));

        let searchButton = this.builder.get_object('search_button');
        searchButton.connect('toggled', this.searchToggled.bind(this));

        this.historyButton = this.builder.get_object('history_button');
        this.historyButton.connect('toggled', this.historyToggled.bind(this));

        let pinToggleButton = this.builder.get_object('pin_button');
        pinToggleButton.connect('toggled', this.pinToggled.bind(this));

        this.searchEntry = this.builder.get_object('search_entry');
        this.searchEntry.set_no_show_all(true);
        this.searchEntry.connect('activate', this.searchEntryActivate.bind(this));

        this.historyBox = this.builder.get_object('history_box');
        this.historyBox.set_no_show_all(true);
        this.historyBox.visible = false;

        this.historyList = this.builder.get_object('history_list');
        this.historyList.set_sort_func(this.listSort);
        this.historySelectID = 0;

        this.deleteButton = this.builder.get_object('delete_word');
        this.deleteButton.connect('clicked', this.deleteSelected.bind(this));

        this.notebook = new Gtk.Notebook({});
        let hbox = this.builder.get_object('horizontal_box');
        hbox.pack_start(this.notebook, true, true, 0);

        this.window.add(this.builder.get_object('vertical_box'));

        this.createTranslateView();
        this._updateNoteBook();
        this.updateHistory();
    }

    createTranslateView() {
        this.shell = new Gtk.Label();
        this.shell.set_xalign(0);
        this.shell.set_yalign(0);
        let scroll_window = new Gtk.ScrolledWindow({ expand: true });
        scroll_window.add(this.shell);
        this.shell.scroll_window = scroll_window;

        let manager = new Webkit.WebsiteDataManager({base_cache_directory: '/dev/null',
                                                     base_data_directory: '/dev/null',
                                                     disk_cache_directory: '/dev/null',
                                                     indexeddb_directory: '/dev/null',
                                                     local_storage_directory: '/dev/null',
                                                     offline_application_cache_directory: '/dev/null',
                                                     websql_directory: '/dev/null' });

        let context = Webkit.WebContext.new_with_website_data_manager(manager);
        this.web_view = Webkit.WebView.new_with_context(context);
        let settings = this.web_view.get_settings();
        settings.set_enable_page_cache(false);
        settings.set_enable_offline_web_application_cache(false);
        settings.set_enable_javascript(this.enableJS);
        settings.set_auto_load_images(this.loadImage);
        this.web_view.set_settings(settings);

        //this.web_view.connect('load_changed', (w, event) => {
            //if (event != Webkit.LoadEvent.FINISHED)
                //return;

            //this.web_view.show();
        //});

        this.web_view.load_uri(this._getUrl());
    }

    searchToggled(button) {
        this.searchEntry.visible = button.get_active();
        this.searchEntry.grab_focus_without_selecting();
    }

    searchEntryActivate(entry) {
        this.translateWords(entry.get_text(), null, null);
    }

    historyToggled(button) {
        this.historyBox.visible = button.get_active();
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
    }

    _mouseMotion(widget, event) {
    }

    _mouseLeave(widget, event) {
        this.historyButton.set_active(false);
        this.historyBox.visible = false;
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

    _shellTranslateWord(word) {
        let cmd = "trans -t " + this.language + " --show-languages n --no-ansi " + word;
        try {
            let [result, stdout, stderr, status] = GLib.spawn_command_line_sync(cmd);

            let text = Utf8ArrayToStr(stdout);

            this.shell.set_markup(text);

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
            label =new Gtk.Label();
            label.set_text('translate shell');
            this.notebook.append_page(this.shell.scroll_window, label);
            this.notebook.child_set_property(this.shell.scroll_window, 'tab-expand', true);
        }

        if (this.enableWeb) {
            label =new Gtk.Label();
            label.set_text('web');
            this.notebook.append_page(this.web_view, label);
            this.notebook.child_set_property(this.web_view, 'tab-expand', true);
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

    translateWords(words, x, y, addToHistory = true) {
        let oldWord = this.words;
        this.words = words;

        if (this.enableWeb && oldWord != words) {
            this.web_view.load_uri(this._getUrl(this.words));
            if (addToHistory)
                this.addToHistory(words);
        }

        if (this.enableTransShell)
            this._shellTranslateWord(words);

        this.notebook.prev_page();
        this.window.show_all();
        this.active = true;
    }

    linkUpdate(link, enableJS, loadImage) {
        this.url = link;
        this.enableJS = enableJS;
        let settings = this.web_view.get_settings();
        settings.set_enable_javascript(this.enableJS);

        this.loadImage = loadImage;
        settings.set_auto_load_images(this.loadImage);

        this.web_view.set_settings(settings);
    }

    windowSize(width, height) {
        this.window.resize(width, height);
    }

    closeDict() {
        this.application.quit();
    }

    hideDict() {
        if (this.active) {
            this.active = false;
            this.historyButton.set_active(false);
            this.historyBox.visible = false;
            this.window.hide();
        } else {
            this.translateWords(this.words, null, null);
        }
    }

    loadHistory() {
        let path = GLib.build_filenamev([this.path, 'history.json']);
        this.historyFile = Gio.File.new_for_path(path);
        if (!this.historyFile.query_exists(null))
            this.historyFile.create(Gio.FileCreateFlags.NONE, null);

        this.history = [];
        let [ok, contents] = this.historyFile.load_contents(null);
        if (contents.length != 0) {
            this.history = JSON.parse(contents);
        }
    }

    addToHistory(word) {
        word = word.toLowerCase();
        let newWord = {};
        newWord.word = word;
        newWord.date = GLib.get_real_time();
        //newWord.date = GLib.DateTime.new_now_local().get_ymd();
        if (this.findInHistory(word))
            return;

        this.history.push(newWord);
        let [success, tag] = this.historyFile.replace_contents(JSON.stringify(this.history),
                                                               null,
                                                               false,
                                                               Gio.FileCreateFlags.REPLACE_DESTINATION,
                                                               null);
        this.updateHistory();
    }

    deleteInHistory(word) {
        this.history.forEach( w => {
            if (w.word == word)
                result = true;
        });
    }

    findInHistory(word) {
        let result = false;
        this.history.forEach( w => {
            if (w.word == word)
                result = true;
        });

        return result;
    }

    updateHistory() {
        if (this.historySelectID)
            this.historyList.disconnect(this.historySelectID);

        this.historyList.get_children().forEach( c => {
            this.historyList.remove(c);
        });

        this.history.forEach( w => {
            this.historyList.add(this.listRow(w.word));
        });

        let row = this.historyList.get_selected_row();
        if (row)
            this.historyList.unselect_row(row);

        //this.historySelectID = this.historyList.connect('selected_rows_changed', this.listSelectChange.bind(this));
        this.historySelectID = this.historyList.connect('row_selected', this.listSelectChange.bind(this));
    }

    listSort(row1, row2) {
        let d1 = row1.get_children()[0];
        let d2 = row2.get_children()[0];
        return d1.rowText > d2.rowText;
    }

    listSelectChange() {
        print("wxg: listSelectChange");
        let row = this.historyList.get_selected_row();
        let child = row.get_children();
        let box = child[0];
        this.translateWords(box.rowText, null, null, false);
    }

    listRow(text) {
        let builder = new Gtk.Builder();
        builder.add_from_file(this.path + '/list_row.ui');

        let box = builder.get_object('list_row');
        let row = builder.get_object('row_text');
        row.set_label(text);
        box.rowText = text;

        return box;
    }

    deleteSelected() {
        let row = this.historyList.get_selected_row();
        let box = row.get_children()[0];
        if (row)
            this.historyList.remove(row);
    }
};

function Utf8ArrayToStr(array) {
    var out, i, len, c;
    var char2, char3;

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
