import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
const DEFAULTS = {
    compiler: { path: '', args: [], autoDetect: true },
    includePaths: ['${workspaceFolder}/pawno/include'],
    output: { encoding: 'windows1252' },
    build: { showCommand: false },
    syntax: { scheme: 'none', applyOnStartup: false },
    ui: { separateContainer: false, showIncludePaths: false },
    server: {
        path: '', cwd: '${workspaceFolder}', args: [],
        clearOnStart: true, logPath: '${workspaceFolder}/server_log.txt',
        logEncoding: 'windows1252',
        output: { follow: 'visible' },
    },
};
function isPlainObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function deepMerge(base, override) {
    const result = { ...base };
    for (const key of Object.keys(override)) {
        const bv = result[key];
        const ov = override[key];
        if (isPlainObject(bv) && isPlainObject(ov)) {
            result[key] = deepMerge(bv, ov);
        }
        else if (ov !== undefined) {
            result[key] = ov;
        }
    }
    return result;
}
function readJsonFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return isPlainObject(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function writeJsonFile(filePath, data) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, filePath);
}
function substituteWorkspace(value, workspaceRoot) {
    if (typeof value === 'string') {
        return value.replace(/\$\{workspaceFolder\}/g, workspaceRoot);
    }
    if (Array.isArray(value)) {
        return value.map(v => substituteWorkspace(v, workspaceRoot));
    }
    if (isPlainObject(value)) {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = substituteWorkspace(v, workspaceRoot);
        }
        return out;
    }
    return value;
}
export class PawnProConfigManager {
    projectRoot;
    globalPath;
    projectPath;
    merged = structuredClone(DEFAULTS);
    raw = {
        global: {},
        project: {},
    };
    listeners = [];
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        this.globalPath = path.join(os.homedir(), '.pawnpro', 'config.json');
        this.projectPath = path.join(projectRoot, '.pawnpro', 'config.json');
        this.reload();
    }
    get globalConfigPath() { return this.globalPath; }
    get projectConfigPath() { return this.projectPath; }
    reload() {
        this.raw.global = readJsonFile(this.globalPath) ?? {};
        this.raw.project = readJsonFile(this.projectPath) ?? {};
        const merged = deepMerge(deepMerge(structuredClone(DEFAULTS), this.raw.global), this.raw.project);
        this.merged = substituteWorkspace(merged, this.projectRoot);
        this.notify();
    }
    getAll() {
        return this.merged;
    }
    get(section) {
        return this.merged[section];
    }
    set(section, value, scope) {
        const filePath = scope === 'global' ? this.globalPath : this.projectPath;
        const current = readJsonFile(filePath) ?? {};
        if (isPlainObject(current[section]) && isPlainObject(value)) {
            current[section] = { ...current[section], ...value };
        }
        else {
            current[section] = value;
        }
        writeJsonFile(filePath, current);
        this.reload();
    }
    setKey(dotPath, value, scope) {
        const filePath = scope === 'global' ? this.globalPath : this.projectPath;
        const current = readJsonFile(filePath) ?? {};
        const parts = dotPath.split('.');
        // Guard against prototype pollution
        const forbidden = ['__proto__', 'constructor', 'prototype'];
        if (parts.some(p => forbidden.includes(p))) {
            throw new Error('Invalid config key: prototype pollution attempt');
        }
        let cursor = current;
        for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i];
            if (!isPlainObject(cursor[key])) {
                cursor[key] = {};
            }
            cursor = cursor[key];
        }
        cursor[parts[parts.length - 1]] = value;
        writeJsonFile(filePath, current);
        this.reload();
    }
    onChange(listener) {
        this.listeners.push(listener);
        return {
            dispose: () => {
                const idx = this.listeners.indexOf(listener);
                if (idx >= 0)
                    this.listeners.splice(idx, 1);
            },
        };
    }
    hasProjectConfig() {
        try {
            return fs.existsSync(this.projectPath);
        }
        catch {
            return false;
        }
    }
    hasGlobalConfig() {
        try {
            return fs.existsSync(this.globalPath);
        }
        catch {
            return false;
        }
    }
    static get defaults() {
        return DEFAULTS;
    }
    notify() {
        for (const fn of this.listeners) {
            try {
                fn(this.merged);
            }
            catch { /* ignore listener errors */ }
        }
    }
}
//# sourceMappingURL=config.js.map