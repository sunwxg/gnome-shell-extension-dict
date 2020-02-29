const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const System = imports.system;
const GLib = imports.gi.GLib;
const Signals = imports.signals;

imports.searchPath.push(GLib.path_get_dirname(System.programInvocationName));
const Util = imports.util;

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

        this.star = new Star();
        this.star.connect('starChanged', this.updateStar.bind(this));
        this.historyBox.add(this.star.box);

        this.deleteButton = this.builder.get_object('delete_word');
        this.deleteButton.connect('clicked', this.deleteSelected.bind(this));

        this.starButton = this.builder.get_object('star_button');
        this.setupStarButton();

        this.starFilter = 0;
        this.updateHistoryList();
    }

    setupStarButton() {
        let gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(this.path + '/icons/star.png') });
        let image = new Gtk.Image();
        image.set_from_gicon(gicon, Gtk.IconSize.BUTTON);
        this.starButton.set_image(image);

        let button;
        button = this.builder.get_object('star_0');
        button.star = 0;
        button.connect('clicked', this.doStarFilter.bind(this));

        button = this.builder.get_object('star_1');
        button.star = 1;
        button.connect('clicked', this.doStarFilter.bind(this));

        button = this.builder.get_object('star_2');
        button.star = 2;
        button.connect('clicked', this.doStarFilter.bind(this));

        button = this.builder.get_object('star_3');
        button.star = 3;
        button.connect('clicked', this.doStarFilter.bind(this));
    }

    doStarFilter(button) {
        this.starFilter = button.star;
        this.updateHistoryList();
    }

    loadHistory() {
        let path = GLib.build_filenamev([GLib.get_home_dir(), '.dict_history.json']);
        this.historyFile = Util.openFile(path);
        this.history = Util.loadJSON(this.historyFile);

        path = GLib.build_filenamev([GLib.get_home_dir(), '.dict_delete.json']);
        this.deleteFile = Util.openFile(path);
        this.deleteWords = Util.loadJSON(this.deleteFile);

        this.loadOtherHistory();
    }

    loadOtherHistory() {
        let path = GLib.build_filenamev([GLib.get_home_dir(), '.dict']);
        let files = Util.openFolder(path);

        files.forEach( file => {
            let history = Util.loadJSON(file);
            history.forEach( d => {
                let find = false;
                this.deleteWords.forEach( w => {
                    if (w == d.word)
                        find = true;
                });

                if (!find && this.findInHistory(d.word) == null)
                    this.history.push(d);
            });
        })

        this.saveHistory();
    }

    addWord(word) {
        word = word.toLowerCase();
        let newWord = {};
        newWord.word = word;
        newWord.date = GLib.get_real_time();
        newWord.star = 0;
        if (this.findInHistory(word) != null)
            return;

        this.star.setStar(newWord.star);
        this.history.push(newWord);
        this.saveHistory();
        this.updateHistoryList();
    }

    updateStar(star, number) {
        let row = this.historyList.get_selected_row();
        if (row == null) {
            this.star.setSensitiveFalse();
            return;
        }

        let child = row.get_children();
        let box = child[0];
        box.star = number;

        let index = this.findInHistory(box.rowText);
        if (index != null)
            this.history[index].star = number;
        this.saveHistory();
    }

    deleteInHistory(word) {
        let index = this.findInHistory(word);
        if (index != null)
            this.history.splice(index, 1);
        this.saveHistory();
        this.saveDeleteFile(word);
    }

    saveHistory() {
        Util.saveJsonToFile(this.historyFile, this.history);
    }

    findInHistory(word) {
        let index = null;
        this.history.forEach( w => {
            if (w.word == word)
                index = this.history.indexOf(w);
        });

        return index;
    }

    saveDeleteFile(word) {
        let find = false;
        this.deleteWords.forEach( w => {
            if (w == word)
                find = true
        });

        if (!find) {
            this.deleteWords.push(word);
            Util.saveJsonToFile(this.deleteFile, this.deleteWords);
        }
    }

    updateHistoryList() {
        if (this.historySelectID)
            this.historyList.disconnect(this.historySelectID);

        this.historyList.get_children().forEach( c => {
            this.historyList.remove(c);
        });

        this.history.forEach( w => {
            if (w.star == null)
                w.star = 0;

            if (this.starFilter == 0)
                this.historyList.add(this.listRow(w.word, w.star));
            else if (this.starFilter == w.star)
                this.historyList.add(this.listRow(w.word, w.star));
        });

        let row = this.historyList.get_selected_row();
        if (row)
            this.historyList.unselect_row(row);

        //this.historySelectID = this.historyList.connect('selected_rows_changed', this.listSelectChange.bind(this));
        this.historySelectID = this.historyList.connect('row_selected', this.listSelectChange.bind(this));

        this.star.setSensitiveFalse();
    }

    listSort(row1, row2) {
        let d1 = row1.get_children()[0];
        let d2 = row2.get_children()[0];
        return d1.rowText > d2.rowText;
    }

    listSelectChange() {
        let row = this.historyList.get_selected_row();
        if (row == null) {
            this.star.setSensitiveFalse();
            return;
        }

        let child = row.get_children();
        let box = child[0];
        this.star.setStar(box.star);
        this.emit("selectChanged", box.rowText);
    }

    listRow(text, star) {
        let builder = new Gtk.Builder();
        builder.add_from_file(this.path + '/list_row.ui');

        let box = builder.get_object('list_row');
        let row = builder.get_object('row_text');
        row.set_label(text.substring(0, 20));
        box.rowText = text.substring(0, 20);
        box.star = star;

        return box;
    }

    deleteSelected() {
        let row = this.historyList.get_selected_row();
        let box = row.get_children()[0];
        if (row) {
            this.historyList.remove(row);
            this.deleteInHistory(box.rowText);
            this.emit("deleteWord", box.rowText);
        }
    }
};
Signals.addSignalMethods(History.prototype);

var Star = class Star {
    constructor() {
        this.path = GLib.path_get_dirname(System.programInvocationName);

        this.box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        this.box.visible = true;

        this.buttons = [];
        for (let i = 0; i < 3; i++) {
            let button = new Gtk.Button();
            button.visible = true;
            button.set_relief(Gtk.ReliefStyle.NONE);
            button.set_image(this.unstarImage());
            button.set_sensitive(false);
            button.star = false;
            button.number = i + 1;
            button.connect('clicked', this.starClicked.bind(this));

            this.box.pack_start(button, true, true, 0);
            this.buttons[i] = button;
        }
    }

    starImage() {
        let gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(this.path + '/icons/star.png') });
        let image = new Gtk.Image();
        image.set_from_gicon(gicon, Gtk.IconSize.BUTTON);

        return image;
    }

    unstarImage() {
        let gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(this.path + '/icons/star-empty.png') });
        let image = new Gtk.Image();
        image.set_from_gicon(gicon, Gtk.IconSize.BUTTON);

        return image;
    }

    starClicked(button) {
        let number;
        if (button.star)
            number = button.number - 1;
        else
            number = button.number;

        this.setStar(number);

        this.emit("starChanged", number);
    }

    setSensitiveFalse() {
        this.buttons.forEach( button => {
            button.set_image(this.unstarImage());
            button.set_sensitive(false);
            button.star = false;
        });
    }

    setStar(number) {
        if (number == null)
            number = 0;

        for (let i = 0; i < this.buttons.length; i++) {
            if (i < number) {
                this.buttons[i].set_image(this.starImage());
                this.buttons[i].star = true;
            } else {
                this.buttons[i].set_image(this.unstarImage())
                this.buttons[i].star = false;
            }
            this.buttons[i].set_sensitive(true);
        }
    }
};
Signals.addSignalMethods(Star.prototype);
