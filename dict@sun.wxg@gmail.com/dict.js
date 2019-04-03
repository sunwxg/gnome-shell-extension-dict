#!/usr/bin/gjs

const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const System = imports.system;
const GLib = imports.gi.GLib;
const Webkit = imports.gi.WebKit2;

const WEB_SITE = 'https://www.bing.com/dict/search?q=%WORD&mkt=zh-cn';

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

class Dict {
    constructor(words) {
        this.url = WEB_SITE;
        this.words = words;
        this.active = false;

        this.path = GLib.path_get_dirname(System.programInvocationName);

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
        //print("wxg: onActivate");
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

        //this.window.connect('focus-in-event', () => { print("wxg: focus in") });
        this.focusOutId = this.window.connect('focus-out-event', this._mouseLeave.bind(this));
        //this.window.connect('enter-notify-event', this._mouseMotion.bind(this));
        //this.window.connect('leave-notify-event', this._mouseLeave.bind(this));
        this.window.set_events(Gdk.EventMask.ALL_EVENTS_MASK);
        this.window.connect('configure-event', this.windowSizeChanged.bind(this));

        this.window.set_resizable(true);
        this.window.set_size_request(600, 500);
        this.width = 500;
        this.height = 600;

        let headerBar = new Gtk.HeaderBar({ show_close_button: false,
                                            title: 'Dict', });
        this.window.set_titlebar(headerBar);

        let button = new Gtk.ToggleButton({});
        button.set_relief(Gtk.ReliefStyle.NONE);
        button.connect('toggled', this.pinToggled.bind(this));

        let image = Gtk.Image.new_from_file(this.path + '/icons/push-pin.png');
        button.set_image(image);

        headerBar.pack_end(button);

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
        settings.set_enable_javascript(false);
        this.web_view.set_settings(settings);

        /*
        this.web_view.connect('load_changed', (w, event) => {
            //print("wxg: event: ", event);
            switch(event) {
                case Webkit.LoadEvent.FINISHED:
                    print("wxg: event: finished");
                    break;
                case Webkit.LoadEvent.COMMITTED:
                    print("wxg: event: committed");
                    break;
                case Webkit.LoadEvent.REDIRECTED:
                    print("wxg: event: redirected");
                    break;
                case Webkit.LoadEvent.STARTED:
                    print("wxg: event: started");
                    break;
            }

            if (event != Webkit.LoadEvent.FINISHED)
                return;

            this.web_view.show();
        });
        */

        this.web_view.load_uri(this._getUrl());

        let scroll_window = new Gtk.ScrolledWindow({ expand: true });
        scroll_window.add(this.web_view);

        let vbox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL,
                                 vexpand: true,
        });

        vbox.add(scroll_window);

        this.window.add(vbox);
        this._label = new Gtk.Label({ label: "Welcome to GNOME, too!" });
    }

    windowSizeChanged() {
        let [width, height] = this.window.get_size();
        if (this.width != width || this.height != height) {
            this.width = width;
            this.height = height;
            this._impl.emit_signal('windowSizeChanged', GLib.Variant.new('(uu)', [width, height]));
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
        //print("wxg: event is ", event.get_event_type());
    }

    _mouseLeave(widget, event) {
        //print("wxg: window event is ", event.get_event_type());
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

    translateWords(words, x, y) {
        this.words = words;
        this.x = x;
        this.y = y;

        this.web_view.load_uri(this._getUrl(this.words));
        this.setWindowPosition();
        this.window.show_all();
        this.window.activate();
        this.active = true;
    }

    setWindowPosition() {
        let screen = this.window.get_screen();
        let display = screen.get_display();
        let monitor = display.get_monitor_at_point(this.x, this.y);
        let workarea = monitor.get_workarea();

        let windowX, windowY;
        let [width, height] = this.window.get_size();
        if ((this.x + width) <= (workarea.x + workarea.width)) {
            windowX = this.x;
        } else {
            windowX = this.x - width;
            if (windowX < 0)
                windowX = 0;
        }

        if (((this.y - height / 2) >= workarea.y) && ((this.y + height / 2) <= (workarea.y + workarea.height))) {
            windowY = this.y - height / 2;
        } else if ((this.y - height / 2) < workarea.y) {
            windowY = workarea.y;
        } else {
            windowY = workarea.y + workarea.height - height;
        }

        this.window.move(windowX, Math.floor(windowY));
    }

    linkUpdate(link) {
        this.url = link;
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
            this.window.hide();
        } else {
            this.translateWords(this.words, this.x, this.y);
        }
    }
};

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
