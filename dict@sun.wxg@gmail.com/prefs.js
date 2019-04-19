const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const SCHEMA_NAME = 'org.gnome.shell.extensions.dict';
const ADDRESS_LIST = 'address-list';
const ADDRESS_ACTIVE = 'address-active';

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

        this.addBoldTextToBox("Dictionary online address", vbox);
        vbox.add(new Gtk.HSeparator({margin_bottom: 5, margin_top: 5}));

        let addressBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
        });


        this.addressListBox = new Gtk.ListBox({
            margin_top: 10,
        });

        ADDRESS.forEach( (a) => {
            this.addressListBox.add(this.addressRow(a, true));
        });

        let addressList = [];
        gsettings.get_strv(ADDRESS_LIST).forEach( (a) => {
            if (a != "")
                addressList.push(a);
        });

        addressList.forEach( (a) => {
            this.addressListBox.add(this.addressRow(a, false));
        });

        let addressActive = gsettings.get_string(ADDRESS_ACTIVE);
        this.addressListBox.get_children().forEach( (row) => {
            let [check, entry] = row.get_child().get_children();
            if (entry.get_text() == addressActive) {
                check.active = true;
            }
        });

        vbox.add(this.addRemoveButton());
        vbox.add(this.addressListBox);

        this.widget.add(vbox);
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

        return hbox;
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
        let txt = new Gtk.Label({xalign: 0});
        txt.set_markup('<b>' + text + '</b>');
        txt.set_line_wrap(true);
        box.add(txt);
    }
}

