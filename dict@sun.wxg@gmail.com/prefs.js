const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
let gsettings;

const SCHEMA_NAME = 'org.gnome.shell.extensions.dict';
const ADDRESS_LIST = 'address-list';

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
        //addressBox.add(this.addressHead());


        this.addressListBox = new Gtk.ListBox({
            margin_top: 10,
        });

        let addressList = [];
        gsettings.get_strv(ADDRESS_LIST).forEach( (a) => {
            let [enable, link] = a.split(';');
            addressList.push({ enable: (enable == 'true') ? true : false,
                               address: link });
        });

        this.checkButtonToggleId = [];
        addressList.forEach( (a) => {
            this.addressListBox.add(this.addressRow(a.enable, a.address));
        });

        //let frame = new Gtk.Frame({ margin: 10 });
        //frame.add(addressBox);
        //vbox.add(frame);

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
        this.addressListBox.add(this.addressRow(false, 'http://'));
        this.addressListBox.show_all();
    }

    removeClicked() {
        let row = this.addressListBox.get_selected_row();
        if (row)
            this.addressListBox.remove(row);

        this.addressUpdate();
    }

    addressRow(enable, address) {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });

        let check = new Gtk.CheckButton();
        check.active = enable;
        hbox.pack_start(check, false, false, 5);
        check.id = check.connect('toggled', this.checkToggled.bind(this));

        let entry = new Gtk.Entry();
        entry.set_text(address);
        hbox.pack_end(entry, true, true, 5);
        entry.connect('changed', this.addressUpdate.bind(this));

        let row = new Gtk.ListBoxRow({});
        row.add(hbox);

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
        let rows = this.addressListBox.get_children();
        rows.forEach( (row) => { let [check, entry] = row.get_child().get_children();
            let enable = check.active ? 'true' : 'false';
            let link = entry.get_text();
            addressList.push(enable + ';' + link);
        });

        gsettings.set_strv(ADDRESS_LIST, addressList);
    }

    addressHead() {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });

        let enableLabel = new Gtk.Label({ label: "Enable" });
        let frame = new Gtk.Frame({ margin: 5 });
        frame.add(enableLabel);
        hbox.pack_start(frame, false, false, 5);

        let nameLabel = new Gtk.Label({ label: "Name" });
        frame = new Gtk.Frame({ margin: 5 });
        frame.add(nameLabel);
        hbox.pack_start(frame, false, false, 5);

        let addressLabel = new Gtk.Label({ label: "Adress" });
        frame = new Gtk.Frame({ margin: 5 });
        frame.add(addressLabel);
        hbox.pack_end(frame, true, true, 5);

        return hbox;
    }

    addBoldTextToBox(text, box) {
        let txt = new Gtk.Label({xalign: 0});
        txt.set_markup('<b>' + text + '</b>');
        txt.set_line_wrap(true);
        box.add(txt);
    }
}

