import * as fs from 'fs';
import * as path from 'path';
const DEFAULTS = {
    server: { favorites: [], history: [] },
};
function readJsonFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null;
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
export class PawnProStateManager {
    filePath;
    data = structuredClone(DEFAULTS);
    constructor(projectRoot) {
        this.filePath = path.join(projectRoot, '.pawnpro', 'state.json');
        this.load();
    }
    get stateFilePath() { return this.filePath; }
    load() {
        const raw = readJsonFile(this.filePath);
        if (!raw) {
            this.data = structuredClone(DEFAULTS);
            return;
        }
        this.data = {
            server: {
                favorites: Array.isArray(raw.server?.favorites)
                    ? raw.server.favorites
                    : [],
                history: Array.isArray(raw.server?.history)
                    ? raw.server.history
                    : [],
            },
        };
    }
    save() {
        writeJsonFile(this.filePath, this.data);
    }
    getAll() {
        return structuredClone(this.data);
    }
    get(key) {
        return structuredClone(this.data[key]);
    }
    update(key, value) {
        this.data[key] = structuredClone(value);
        this.save();
    }
}
//# sourceMappingURL=state.js.map