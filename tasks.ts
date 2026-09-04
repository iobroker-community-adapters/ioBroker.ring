/**
 * Build steps for the React admin tab in src-tab/.
 *
 * The backend build is plain `tsc` (see tsconfig.build.json) and stays in the `build` script.
 * Everything that has to happen on top of it lives here, so there is no chain of && in
 * package.json and every stage can be repeated on its own while debugging:
 *
 *   npm run 0-clean   remove the previous tab output
 *   npm run 1-npm     install src-tab dependencies
 *   npm run 2-build   vite build -> src-tab/build
 *   npm run 3-copy    copy the assets into admin/
 *   npm run 4-patch   turn src-tab/build/index.html into admin/tab_m.html
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { buildReact, copyFiles, deleteFoldersRecursive, npmInstall } from '@iobroker/build-tools';

const SRC = `${__dirname}/src-tab`;

function clean(): void {
    deleteFoldersRecursive(`${SRC}/build`);
    deleteFoldersRecursive(`${__dirname}/admin/assets`);
    if (existsSync(`${__dirname}/admin/tab_m.html`)) {
        unlinkSync(`${__dirname}/admin/tab_m.html`);
    }
}

function install(): Promise<void> {
    if (existsSync(`${SRC}/node_modules`)) {
        return Promise.resolve();
    }
    return npmInstall(SRC);
}

function build(): Promise<void> {
    return buildReact(SRC, { rootDir: __dirname, vite: true });
}

function copyAllFiles(): void {
    copyFiles([`src-tab/build/assets/*`], 'admin/assets');
}

/**
 * index.html loads socket.io through a script tag it builds itself, so that `npm start` can
 * pull it from a separate admin on port 8081. Inside the admin the file is served next to
 * socket.io and can just include it, which also removes the one-second delay.
 */
function patch(): void {
    const source = `${SRC}/build/index.html`;
    if (!existsSync(source)) {
        throw new Error(`${source} does not exist - did the vite build run?`);
    }
    let code = readFileSync(source).toString('utf8');
    const before = code;
    code = code.replace(
        /<script>[\s\S]*?<\/script>/,
        `<script type="text/javascript" src="./../../lib/js/socket.io.js"></script>`,
    );
    if (code === before) {
        throw new Error('Could not patch the socket.io loader in index.html');
    }
    writeFileSync(`${__dirname}/admin/tab_m.html`, code);
}

function fail(e: unknown): never {
    console.error(e);
    process.exit(1);
}

if (process.argv.includes('--0-clean')) {
    clean();
} else if (process.argv.includes('--1-npm')) {
    install().catch(fail);
} else if (process.argv.includes('--2-build')) {
    build().catch(fail);
} else if (process.argv.includes('--3-copy')) {
    copyAllFiles();
} else if (process.argv.includes('--4-patch')) {
    patch();
} else {
    clean();
    install()
        .then(() => build())
        .then(() => {
            copyAllFiles();
            patch();
        })
        .catch(fail);
}
