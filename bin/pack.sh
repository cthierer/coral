#!/bin/sh

SCRIPT_DIR=$(dirname $0)
cd "${SCRIPT_DIR}/.."

rm -rf dist
mkdir dist

cp -r lib index.js package.json package-lock.json README.md dist

cd dist
npm install --production --silent

cd ..
PACKAGE_VERSION=$(cat package.json | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[[:space:]]')
PACKAGE_NAME=$(cat package.json | grep name | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[[:space:]]')
ZIP_FILE="${PACKAGE_NAME}_v${PACKAGE_VERSION}.zip"

cd dist
zip -r "$ZIP_FILE" * > /dev/null
mv "$ZIP_FILE" ..
cd ..
rm -rf dist
rm "${PACKAGE_NAME}.zip"
cp "$ZIP_FILE" "${PACKAGE_NAME}.zip"

echo "done! packaged build as: $ZIP_FILE"
