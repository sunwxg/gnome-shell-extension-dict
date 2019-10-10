const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const System = imports.system;

function getSettings(schema) {
    const GioSSS = Gio.SettingsSchemaSource;

    let dir = Gio.File.new_for_path(GLib.path_get_dirname(System.programInvocationName));

    let schemaDir = dir.get_child('schemas');
    let schemaSource = GioSSS.new_from_directory(schemaDir.get_path(),
                                                 GioSSS.get_default(),
                                                 false);

    let schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj)
        throw new Error('Schema ' + schema + ' could not be found for extension '
                        + extension.metadata.uuid + '. Please check your installation.');

    return new Gio.Settings({ settings_schema: schemaObj });
}

function openFolder(path) {
    let dir = Gio.File.new_for_path(path);

    let files = [];
    let fileEnum;
    try {
        fileEnum = dir.enumerate_children('standard::name,standard::type',
            Gio.FileQueryInfoFlags.NONE, null);
    } catch (e) {
        fileEnum = null;
    }
    if (fileEnum != null) {
        let info;
        while ((info = fileEnum.next_file(null)))
            files.push(fileEnum.get_child(info));
    }

    return files;
}

function openFile(path) {
    let file = Gio.File.new_for_path(path);
    if (!file.query_exists(null))
        file.create(Gio.FileCreateFlags.NONE, null);

    return file;
}

function loadJSON(file) {
    let map = [];
    let [ok, contents] = file.load_contents(null);
    if (contents.length != 0) {
        map = JSON.parse(imports.byteArray.toString(contents));
    }

    return map;
}

function saveJsonToFile(file, json) {
    let [success, tag] = file.replace_contents(JSON.stringify(json),
                                               null,
                                               false,
                                               Gio.FileCreateFlags.REPLACE_DESTINATION,
                                               null);
}

function loadJSONfromZip(file) {
    let map = [];
    let [ok, contents] = file.load_contents(null);
    if (contents.length != 0) {
        let decompressor = Gio.ZlibDecompressor.new(Gio.ZlibCompressorFormat.GZIP);
        let input = Gio.MemoryOutputStream.new_resizable();
        let inputStream = Gio.ConverterOutputStream.new(input, decompressor);
        inputStream.write_all(contents, null);
        inputStream.close(null);

        map = JSON.parse(imports.byteArray.toString(input.steal_as_bytes().get_data()));
    }

    return map;
}

function saveJsonToZipFile(file, json) {
    let compressor = Gio.ZlibCompressor.new(Gio.ZlibCompressorFormat.GZIP, 9);
    let out = Gio.MemoryOutputStream.new_resizable();
    let outStream = Gio.ConverterOutputStream.new(out, compressor);
    outStream.write_all(JSON.stringify(json), null);
    outStream.close(null);

    let [success, tag] = file.replace_contents(out.steal_as_bytes().get_data(),
                                               null,
                                               false,
                                               Gio.FileCreateFlags.REPLACE_DESTINATION,
                                               null);
}
