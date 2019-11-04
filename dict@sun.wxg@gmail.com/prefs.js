const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const LANGUAGES_LIST = Me.imports.language.LANGUAGES_LIST;

const SCHEMA_NAME = 'org.gnome.shell.extensions.dict';
const ADDRESS_LIST = 'address-list';
const ADDRESS_ACTIVE = 'address-active';
const ENABLE_JAVASCRIPT = 'enable-javascript';
const LOAD_IMAGE = 'load-image';
const TOP_ICON = 'top-icon';
const ENABLE_TRANSLATE_SHELL = 'enable-translate-shell';
const LANGUAGE = 'language';
const ENABLE_WEB = 'enable-web';
const WINDOW_FOLLOW_POINTER = 'window-follow-pointer';

const ADDRESS = [ "https://www.bing.com/dict/search=?q=%WORD&mkt=zh-cn" ]
let gsettings;

function init() {
    gsettings = Convenience.getSettings(SCHEMA_NAME);
}

function buildPrefsWidget() {
    let ui = new buildUi();
    ui.widget.show_all();
    return ui.widget;
}

class buildUi {
    constructor() {
        this.widget = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            border_width: 10
        });

        let vbox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin: 20, margin_top: 10
        });
        vbox.set_size_request(550, 350);

        this.addBoldTextToBox("Shortcut Keys", vbox);
        vbox.add(new Gtk.HSeparator({margin_bottom: 5, margin_top: 5}));
        let info = new Gtk.Label({xalign: 0});
        info.set_markup("Use key <b>Ctrl+Alt+j</b> to toggle popup icon function");
        vbox.add(info);
        info = new Gtk.Label({xalign: 0});
        info.set_markup("Use key <b>Ctrl+Alt+o</b> to show popup window");
        vbox.add(info);

        vbox.add(this.addItemSwitch("<b>Show top icon</b>", TOP_ICON));
        vbox.add(this.addItemSwitch("<b>Popup window follow pointer</b>", WINDOW_FOLLOW_POINTER));

        vbox.add(this.addLanguageCombo());

        vbox.add(this.addItemSwitch(
            "<b>Enable translate-shell</b> (Install translate-shell package first)",
            ENABLE_TRANSLATE_SHELL));

        vbox.add(this.addItemSwitch("<b>Enable Web translate</b>", ENABLE_WEB));
        vbox.add(new Gtk.HSeparator({margin_bottom: 5, margin_top: 5}));
        vbox.add(this.addEnableJS());
        vbox.add(this.addLoadImage());

        this.addBoldTextToBox("Web online address", vbox);
        vbox.add(new Gtk.HSeparator({margin_bottom: 5, margin_top: 5}));

        this.addressListBox = this.addAddressBox();
        vbox.add(this.addAddButton());
        vbox.add(this.addressListBox);

        let addressActive = gsettings.get_string(ADDRESS_ACTIVE);
        this.addressListBox.get_children().forEach( (row) => {
            let [radio, entry] = row.get_children();
            if (entry.get_text() == addressActive) {
                radio.active = true;
            }
        });

        this.widget.add(vbox);
    }

    addItemSwitch(string, key) {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 20});
        let info = new Gtk.Label({xalign: 0});
        info.set_markup(string);
        hbox.pack_start(info, false, false, 0);

        let button = new Gtk.Switch({ active: gsettings.get_boolean(key) });
        button.connect('notify::active', (button) => { gsettings.set_boolean(key, button.active); });
        hbox.pack_end(button, false, false, 0);
        return hbox;
    }

    addLanguageCombo() {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 10});
        let setting_label = new Gtk.Label({  xalign: 0 });
        setting_label.set_markup("<b>Select target language</b>");
        hbox.pack_start(setting_label, true, true, 0);
        hbox.add(this.languageCombo());

        return hbox;
    }

    languageCombo() {
        let combo = new Gtk.ComboBoxText();
        combo.set_entry_text_column(0);

        for (let l in LANGUAGES_LIST) {
            combo.append(l, LANGUAGES_LIST[l]);
        }
        combo.set_active_id(gsettings.get_string(LANGUAGE));

        combo.connect('changed', () => {
            gsettings.set_string(LANGUAGE, combo.get_active_id());
            this.addressUpdate();
        });

        return combo;
    }

    addEnableJS() {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 5, margin_left: 10 });
        let setting_label = new Gtk.Label({ label: "Enable javascript", xalign: 0 });
        this.settingEnableJS = new Gtk.Switch({ active: gsettings.get_boolean(ENABLE_JAVASCRIPT) });

        this.settingEnableJS.connect('notify::active', (button) => { gsettings.set_boolean(ENABLE_JAVASCRIPT, button.active); });

        hbox.pack_start(setting_label, true, true, 0);
        hbox.add(this.settingEnableJS);

        return hbox;
    }

    addLoadImage() {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 5, margin_left: 10});
        let setting_label = new Gtk.Label({ label: "Load image", xalign: 0 });
        this.settingLoadImage = new Gtk.Switch({ active: gsettings.get_boolean(LOAD_IMAGE) });

        this.settingLoadImage.connect('notify::active', (button) => { gsettings.set_boolean(LOAD_IMAGE, button.active); });

        hbox.pack_start(setting_label, true, true, 0);
        hbox.add(this.settingLoadImage);

        return hbox;
    }

    addAddButton() {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL,
            margin_top: 10,
        });

        let label = new Gtk.Label({ label: 'Add' });
        let add = new Gtk.Button({ label: 'Add' });
        add.connect('clicked', this.addClicked.bind(this));

        hbox.pack_start(add, false, false, 5);

        let info = new Gtk.Label();
        info.set_markup("Use <b>%WORD</b> to replace the search word");
        hbox.pack_start(info, false, false, 5);

        return hbox;
    }

    addClicked() {
        this.addressListBox.add(this.addressRow('http://', false));
        this.addressListBox.show_all();
    }

    addAddressBox() {
        let addressBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin_top: 10 });
        addressBox.add(this.addGoogleTranslate());

        ADDRESS.forEach( (a) => {
            addressBox.add(this.addressRow(a, true));
        });

        let addressList = [];
        gsettings.get_strv(ADDRESS_LIST).forEach( (a) => {
            if (a != "")
                addressList.push(a);
        });

        addressList.forEach( (a) => {
            addressBox.add(this.addressRow(a, false));
        });

        return addressBox;
    }

    addGoogleTranslate() {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 10});

        let radioButton = new Gtk.RadioButton({ });
        radioButton.isDefault = true;
        radioButton.google = true;
        radioButton.connect("toggled", this.addressUpdate.bind(this));
        this.radioGroup = radioButton;
        hbox.add(radioButton);

        let info = new Gtk.Label({xalign: 0, margin_left: 10});
        info.set_markup("Use google translate");
        hbox.add(info);

        return hbox;
    }

    googleTranslateUrl() {
        let language = gsettings.get_string(LANGUAGE);
        let url = "https://translate.google.com/#view=home&op=translate&sl=auto&tl=" + language + "&text=%WORD";

        return url;
    }

    addressRow(address, isDefault) {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 10});

        let radioButton = new Gtk.RadioButton({ group: this.radioGroup });
        radioButton.isDefault = isDefault;
        radioButton.connect("toggled", this.addressUpdate.bind(this));
        hbox.pack_start(radioButton, false, false, 0);

        if (isDefault) {
            let label = new Gtk.Label({xalign: 0});
            label.selectable = true;
            label.set_text(address);
            hbox.pack_start(label, false, false, 10);
        } else {
            let entry = new Gtk.Entry({});
            entry.set_text(address);
            entry.connect('changed', this.addressUpdate.bind(this));
            hbox.pack_start(entry, true, true, 10);

            let remove = new Gtk.Button();
            remove.set_label("Remove");
            remove.hbox = hbox;
            remove.connect("clicked", this.removeClicked.bind(this));
            hbox.pack_end(remove, false, false, 0);
        }

        return hbox;
    }

    removeClicked(button) {
        this.addressListBox.remove(button.hbox);
        this.addressUpdate();
    }

    addressUpdate() {
        let addressList = [];
        let addressActive = '';
        let rows = this.addressListBox.get_children();
        rows.forEach( (row) => {
            let [radio, entry] = row.get_children();
            let link = entry.get_text();
            if (!radio.isDefault) {
                addressList.push(link);
            }

            if (radio.active) {
                if (radio.google)
                    addressActive = this.googleTranslateUrl();
                else
                    addressActive = link;
            }
        });

        gsettings.set_strv(ADDRESS_LIST, addressList);
        gsettings.set_string(ADDRESS_ACTIVE, addressActive);
    }

    addBoldTextToBox(text, box) {
        let txt = new Gtk.Label({xalign: 0, margin_top: 20});
        txt.set_markup('<b>' + text + '</b>');
        txt.set_line_wrap(true);
        box.add(txt);
    }
}

