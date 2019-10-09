const System = imports.system;
const GLib = imports.gi.GLib;

imports.searchPath.push(GLib.path_get_dirname(System.programInvocationName));
const Util = imports.util;

var Store = class Store {
    constructor() {
        let path = GLib.build_filenamev([GLib.get_home_dir(), '.dict_store.json.gz']);
        this.dbFile = Util.openFile(path);
        this.db = Util.loadJSONfromZip(this.dbFile);
    }

    addWord(word, text) {
        word = word.toLowerCase();
        if (this.findInDB(word) != null)
            return;

        let newWord = {};
        newWord.word = word;
        newWord.text = text;
        this.db.push(newWord);
        this.saveFile();
    }

    removeWord(word) {
        word = word.toLowerCase();
        let index = this.findInDB(word);
        if (index == null)
            return;

        this.db.splice(index, 1);
        this.saveFile();
    }

    findInDB(word) {
        let index = null;
        this.db.forEach( w => {
            if (w.word == word)
                index = this.db.indexOf(w);
        });

        return index;
    }

    getText(index) {
        return this.db[index].text;
    }

    saveFile() {
        Util.saveJsonToZipFile(this.dbFile, this.db);
    }
}
