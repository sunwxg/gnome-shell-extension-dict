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
