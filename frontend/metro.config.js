const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// The app imports the shared contracts and pure logic (types, tag schema, quiz
// mapping) from the edge-function folder, which sits outside frontend/.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../supabase/functions/_shared")];

module.exports = config;
