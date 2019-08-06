const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const System = imports.system;
const GLib = imports.gi.GLib;
const Signals = imports.signals;

var History = class History {
    constructor() {
        this.loadHistory();
        this.path = GLib.path_get_dirname(System.programInvocationName);

        this.builder = new Gtk.Builder();
        this.builder.add_from_file(this.path + '/history.ui');

        this.historyBox = this.builder.get_object('history_box');
        this.historyBox.visible = false;

        this.historyList = this.builder.get_object('history_list');
        this.historyList.set_sort_func(this.listSort);
        this.historySelectID = 0;

        this.deleteButton = this.builder.get_object('delete_word');
        this.deleteButton.connect('clicked', this.deleteSelected.bind(this));

        this.updateHistoryList();
    }

    loadHistory() {
        let path = GLib.build_filenamev([GLib.get_home_dir(), '.dict_history.json']);
        this.historyFile = Gio.File.new_for_path(path);
        if (!this.historyFile.query_exists(null))
            this.historyFile.create(Gio.FileCreateFlags.NONE, null);

        this.history = [];
        let [ok, contents] = this.historyFile.load_contents(null);
        if (contents.length != 0) {
            //this.history = JSON.parse(imports.byteArray.toString(contents));
            this.history = JSON.parse(contents);
        }
    }

    addWord(word) {
        word = word.toLowerCase();
        let newWord = {};
        newWord.word = word;
        newWord.date = GLib.get_real_time();
        //newWord.date = GLib.DateTime.new_now_local().get_ymd();
        if (this.findInHistory(word))
            return;

        this.history.push(newWord);
        this.saveHistory();
        this.updateHistoryList();
    }

    deleteInHistory(word) {
        let index = null;
        this.history.forEach( w => {
            if (w.word == word)
                index = this.history.indexOf(w);
        });

        if (index)
            this.history.splice(index, 1);
        this.saveHistory();
    }

    saveHistory() {
        let [success, tag] = this.historyFile.replace_contents(JSON.stringify(this.history),
                                                               null,
                                                               false,
                                                               Gio.FileCreateFlags.REPLACE_DESTINATION,
                                                               null);
    }

    findInHistory(word) {
        let result = false;
        this.history.forEach( w => {
            if (w.word == word)
                result = true;
        });

        return result;
    }

    updateHistoryList() {
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
        let row = this.historyList.get_selected_row();
        if (row == null)
            return;

        let child = row.get_children();
        let box = child[0];
        this.emit("selectChanged", box.rowText);
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
        if (row) {
            this.historyList.remove(row);
            this.deleteInHistory(box.rowText);
        }
    }
};
Signals.addSignalMethods(History.prototype);
