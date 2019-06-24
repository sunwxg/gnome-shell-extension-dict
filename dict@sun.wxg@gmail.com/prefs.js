const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const SCHEMA_NAME = 'org.gnome.shell.extensions.dict';
const ADDRESS_LIST = 'address-list';
const ADDRESS_ACTIVE = 'address-active';
const ENABLE_JAVASCRIPT = 'enable-javascript';
const LOAD_IMAGE = 'load-image';

const ADDRESS = [ "https://www.bing.com/dict/search=?q=%WORD&mkt=zh-cn" ];
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

        this.addBoldTextToBox("Shortcut Key", vbox);
        vbox.add(new Gtk.HSeparator({margin_bottom: 5, margin_top: 5}));
        let info = new Gtk.Label({xalign: 0, margin_top: 10});
        info.set_markup("Use key <b>Ctrl+Alt+j</b> to toggle popup icon function");
        vbox.add(info);

        this.addBoldTextToBox("Web loading config", vbox);
        vbox.add(new Gtk.HSeparator({margin_bottom: 5, margin_top: 5}));
        vbox.add(this.addEnableJS());
        vbox.add(this.addLoadImage());

        this.addBoldTextToBox("Dictionary online address", vbox);
        vbox.add(new Gtk.HSeparator({margin_bottom: 5, margin_top: 5}));

        this.addressListBox = this.addAddressListBox();
        vbox.add(this.addRemoveButton());
        vbox.add(this.addressListBox);

        let addressActive = gsettings.get_string(ADDRESS_ACTIVE);
        this.addressListBox.get_children().forEach( (row) => {
            let [check, entry] = row.get_child().get_children();
            if (entry.get_text() == addressActive) {
                check.active = true;
            }
        });

        this.widget.add(vbox);
    }

    addEnableJS() {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 5 });
        let setting_label = new Gtk.Label({ label: "Enable javascript", xalign: 0 });
        this.settingEnableJS = new Gtk.Switch({ active: gsettings.get_boolean(ENABLE_JAVASCRIPT) });

        this.settingEnableJS.connect('notify::active', (button) => { gsettings.set_boolean(ENABLE_JAVASCRIPT, button.active); });

        hbox.pack_start(setting_label, true, true, 0);
        hbox.add(this.settingEnableJS);

        return hbox;
    }

    addLoadImage() {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 5 });
        let setting_label = new Gtk.Label({ label: "Load image", xalign: 0 });
        this.settingLoadImage = new Gtk.Switch({ active: gsettings.get_boolean(LOAD_IMAGE) });

        this.settingLoadImage.connect('notify::active', (button) => { gsettings.set_boolean(LOAD_IMAGE, button.active); });

        hbox.pack_start(setting_label, true, true, 0);
        hbox.add(this.settingLoadImage);

        return hbox;
    }

    addRemoveButton() {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL,
            margin_top: 10,
        });

        let label = new Gtk.Label({ label: 'Add' });
        let add = new Gtk.Button({ label: 'Add' });
        add.connect('clicked', this.addClicked.bind(this));

        label = new Gtk.Label({ label: 'Remove' });
        let remove = new Gtk.Button({ label: 'Remove' });
        remove.connect('clicked', this.removeClicked.bind(this));

        hbox.pack_start(add, false, false, 5);
        hbox.pack_start(remove, false, false, 5);

        let info = new Gtk.Label();
        info.set_markup("Use <b>%WORD</b> to replace the search word");
        hbox.pack_start(info, false, false, 5);

        return hbox;
    }

    addAddressListBox() {
        let addressListBox = new Gtk.ListBox({
            margin_top: 10,
        });

        ADDRESS.forEach( (a) => {
            addressListBox.add(this.addressRow(a, true));
        });

        let addressList = [];
        gsettings.get_strv(ADDRESS_LIST).forEach( (a) => {
            if (a != "")
                addressList.push(a);
        });

        addressList.forEach( (a) => {
            addressListBox.add(this.addressRow(a, false));
        });

        return addressListBox;
    }

    addClicked() {
        this.addressListBox.add(this.addressRow('http://', false));
        this.addressListBox.show_all();
    }

    removeClicked() {
        let row = this.addressListBox.get_selected_row();
        if (!row)
            return;

        if (row.isDefault)
            return;

        this.addressListBox.remove(row);

        this.addressUpdate();
    }

    addressRow(address, isDefault) {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });

        let check = new Gtk.CheckButton();
        hbox.pack_start(check, false, false, 5);
        check.id = check.connect('toggled', this.checkToggled.bind(this));

        let entry = new Gtk.Entry();
        entry.set_text(address);
        hbox.pack_end(entry, true, true, 5);

        if (isDefault)
            entry.editable = false;

        let row = new Gtk.ListBoxRow({});
        row.add(hbox);
        row.isDefault = isDefault;

        entry.connect('changed', this.addressUpdate.bind(this));
        entry.connect("grab_focus", () => { row.emit("activate") });
        return row;
    }

    checkToggled(button) {
        let rows = this.addressListBox.get_children();
        rows.forEach( (row) => { let [check, entry] = row.get_child().get_children();
            if (check != button) {
                check.disconnect(check.id);
                check.active = false;
                check.id = check.connect('toggled', this.checkToggled.bind(this));
            }
        });

        this.addressUpdate();
    }

    addressUpdate() {
        let addressList = [];
        let addressActive;
        let rows = this.addressListBox.get_children();
        rows.forEach( (row) => {
            let [check, entry] = row.get_child().get_children();
            let link = entry.get_text();
            if (!row.isDefault)
                addressList.push(link);

            if (check.active)
                addressActive = link;
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

