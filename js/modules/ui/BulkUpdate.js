/**
 * 一括変更モジュール
 * - 貼り付け（TSV/CSV）→ 正規化 → 上限・重複チェック → 存在確認
 * - 影響行抽出と「変更後状態」組成 → 既存VirtualScrollで表示
 * - 表示直後に既存Validationを全行実行
 */
class BulkUpdate {
    constructor() {
        this.textarea = null;
        this.container = null;
        // モード管理: 'link'（紐づけ変更）| 'fields'（フィールド一括更新）
        this.mode = 'link';
        this._ui = { modeRadios: [], ledgerSelect: null, fieldSelect: null };
        // フィールド一括更新用の一時コンテキスト
        this._fieldUpdateContext = null;
    }

    // エラー表示パネル: クリア
    clearErrorPanel() {
        try {
            const body = (this.container || document).querySelector('.bulk-error-body');
            if (body) body.innerHTML = '';
        } catch (e) { /* noop */ }
    }

    // エラー表示パネル: メッセージ配列を描画
    showErrorPanel(messages = []) {
        try {
            const panel = (this.container || document).querySelector('.bulk-error-panel');
            const body = (this.container || document).querySelector('.bulk-error-body');
            if (!panel || !body) return;
            body.innerHTML = '';
            if (!Array.isArray(messages) || messages.length === 0) return;
            const ul = document.createElement('ul');
            ul.style.margin = '0';
            ul.style.paddingLeft = '20px';
            messages.forEach(msg => {
                const li = document.createElement('li');
                li.textContent = String(msg);
                ul.appendChild(li);
            });
            body.appendChild(ul);
        } catch (e) { /* noop */ }
    }

    buildTabContent() {
        const wrap = DOMHelper.createElement('div', {}, 'bulk-update-container');

        const desc = DOMHelper.createElement('div', {}, 'bulk-desc');
        desc.textContent = '貼り付け形式: ヘッダー無し / PC番号, 内線番号, 座席番号（タブ・カンマ・スペース区切り）。最大1000行。';
        wrap.appendChild(desc);

        // モード切替
        const modeRow = DOMHelper.createElement('div', { style: 'margin:6px 0;' }, 'bulk-mode-row');
        const m1 = DOMHelper.createElement('label', { style: 'margin-right:12px;' });
        const r1 = DOMHelper.createElement('input', { type: 'radio', name: 'bulk-mode', value: 'link', checked: 'checked' });
        r1.addEventListener('change', () => { this.mode = 'link'; this.updateModeUI(); });
        this._ui.modeRadios.push(r1);
        m1.appendChild(r1); m1.appendChild(document.createTextNode(' 紐づけ変更'));
        const m2 = DOMHelper.createElement('label', { style: 'margin-right:12px;' });
        const r2 = DOMHelper.createElement('input', { type: 'radio', name: 'bulk-mode', value: 'fields' });
        r2.addEventListener('change', () => { this.mode = 'fields'; this.updateModeUI(); });
        this._ui.modeRadios.push(r2);
        m2.appendChild(r2); m2.appendChild(document.createTextNode(' フィールド一括更新'));
        modeRow.appendChild(m1); modeRow.appendChild(m2);
        wrap.appendChild(modeRow);

        // フィールド一括更新の設定行（レイアウト）
        const fieldCfg = DOMHelper.createElement('div', { style: 'display:none; gap:12px; align-items:center;' }, 'bulk-field-config-row');
        const ledgerLabel = DOMHelper.createElement('label', { style: 'margin-right:4px;' });
        ledgerLabel.textContent = '対象台帳:';
        const ledgerSelect = DOMHelper.createElement('select', { style: 'min-width:140px;' }, 'bulk-ledger-select');
        ;(['PC台帳','内線台帳','座席台帳']).forEach(name => {
            const opt = DOMHelper.createElement('option', { value: name }); opt.textContent = name; ledgerSelect.appendChild(opt);
        });
        ledgerSelect.addEventListener('change', () => this.populateFieldSelect());
        this._ui.ledgerSelect = ledgerSelect;
        const fieldLabel = DOMHelper.createElement('label', { style: 'margin-left:8px; margin-right:4px;' });
        fieldLabel.textContent = '更新フィールド:';
        const fieldSelect = DOMHelper.createElement('select', { multiple: 'multiple', size: '4', style: 'min-width:220px;' }, 'bulk-field-select');
        this._ui.fieldSelect = fieldSelect;
        fieldCfg.appendChild(ledgerLabel);
        fieldCfg.appendChild(ledgerSelect);
        fieldCfg.appendChild(fieldLabel);
        fieldCfg.appendChild(fieldSelect);
        wrap.appendChild(fieldCfg);

        // 貼り付けテキストエリアとエラー表示パネルを横並び
        const pasteAndErrorRow = DOMHelper.createElement('div', { style: 'display:flex; gap:12px; align-items:flex-start;' }, 'bulk-paste-error-row');
        this.textarea = DOMHelper.createElement('textarea', { rows: '8', placeholder: '貼付順序: PC番号 内線番号 座席番号\n区切り: タブ / カンマ / スペース\n例:\nPCAIT23N1201 701201 池袋19F-A1201\nPCAIT23N1202,701202,池袋19F-A1202\nPCAIT23N1203\t701203\t池袋19F-A1203', style: 'flex:1; min-width:380px;' }, 'bulk-paste-input');
        pasteAndErrorRow.appendChild(this.textarea);
        const errorPanel = DOMHelper.createElement('div', { style: 'flex:1; min-height:140px; border:1px solid #ddd; border-radius:4px; padding:8px; background:#fff;' }, 'bulk-error-panel');
        const errorTitle = DOMHelper.createElement('div', { style: 'font-weight:600; margin-bottom:6px;' }, 'bulk-error-title');
        errorTitle.textContent = 'エラー表示';
        const errorBody = DOMHelper.createElement('div', {}, 'bulk-error-body');
        errorPanel.appendChild(errorTitle);
        errorPanel.appendChild(errorBody);
        pasteAndErrorRow.appendChild(errorPanel);
        wrap.appendChild(pasteAndErrorRow);

        const btnRow = DOMHelper.createElement('div', {}, 'bulk-btn-row');
        const importBtn = DOMHelper.createElement('button', {}, 'bulk-import-btn');
        importBtn.textContent = '取り込み';
        importBtn.addEventListener('click', () => this.runImport());
        const clearBtn = DOMHelper.createElement('button', {}, 'bulk-clear-btn');
        clearBtn.textContent = 'クリア';
        clearBtn.addEventListener('click', () => { if (this.textarea) this.textarea.value = ''; });
        btnRow.appendChild(importBtn);
        btnRow.appendChild(clearBtn);
        wrap.appendChild(btnRow);

        const tip = DOMHelper.createElement('div', {}, 'bulk-tip');
        tip.textContent = '注意: 値内カンマ/改行は不可。存在しない主キーや重複はセルエラーとして表示されます。';
        wrap.appendChild(tip);

        this.container = wrap;
        // 初期化
        this.populateFieldSelect();
        this.updateModeUI();
        return wrap;
    }

    // モードに応じたUI切替とプレースホルダー更新
    updateModeUI() {
        try {
            const cfgRow = (this.container || document).querySelector('.bulk-field-config-row');
            if (cfgRow) cfgRow.style.display = (this.mode === 'fields') ? 'flex' : 'none';
            this.updatePlaceholder();
        } catch (e) { /* noop */ }
    }

    // 対象台帳に応じて選択可能フィールドを構築（CONFIG.columnsから主キー以外）
    populateFieldSelect() {
        try {
            const ledger = this.getTargetLedgerName();
            const select = this._ui.fieldSelect;
            if (!select) return;
            select.innerHTML = '';
            const cols = CONFIG.integratedTableConfig.columns
                .filter(c => c.ledger === ledger && !c.primaryKey && !c.isChangeFlag && !c.isDetailLink);
            cols.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.fieldCode; opt.textContent = c.label || c.fieldCode; select.appendChild(opt);
            });
            this.updatePlaceholder();
        } catch (e) { /* noop */ }
    }

    getTargetLedgerName() {
        const sel = this._ui.ledgerSelect;
        return sel && sel.value ? sel.value : 'PC台帳';
    }

    getSelectedFieldCodes() {
        const sel = this._ui.fieldSelect;
        if (!sel) return [];
        return Array.from(sel.selectedOptions || []).map(o => o.value);
    }

    updatePlaceholder() {
        try {
            if (!this.textarea) return;
            if (this.mode === 'link') {
                this.textarea.placeholder = '貼付順序: PC番号 内線番号 座席番号\n区切り: タブ / カンマ / スペース\n例:\nPCAIT23N1201 701201 池袋19F-A1201\nPCAIT23N1202,701202,池袋19F-A1202\nPCAIT23N1203\t701203\t池袋19F-A1203';
                return;
            }
            const ledger = this.getTargetLedgerName();
            const pk = ledger === 'PC台帳' ? 'PC番号' : (ledger === '内線台帳' ? '内線番号' : '座席番号');
            const pkExample = (pk === 'PC番号') ? 'PCAIT23N1201' : (pk === '内線番号') ? '701201' : '池袋19F-A1201';
            this.textarea.placeholder = `貼付順序：${pk},更新フィールド\n区切り：タブ/カンマ/スペース\n例：\n${pkExample},更新フィールドの値`;
        } catch (e) { /* noop */ }
    }

    async runImport() {
        try {
            const raw = (this.textarea && this.textarea.value) ? this.textarea.value : '';
            this.clearErrorPanel();
            const lines = this.splitLines(raw);
            if (lines.length === 0) {
                this.showErrorPanel(['貼り付けデータが空です']);
                return;
            }
            if (lines.length > (CONFIG.bulkUpdate?.maxRows || 1000)) {
                this.showErrorPanel([`行数上限を超えています（最大${CONFIG.bulkUpdate.maxRows}行）`]);
                return;
            }

            this.showProgress(CONFIG.bulkUpdate?.progressMessages?.parsing || '取り込み中...');
            const records = [];
            const localErrors = [];
            if (this.mode === 'link') {
                lines.forEach((line, idx) => {
                    const cols = this.splitColumns(line);
                    if (cols.length !== 3) {
                        localErrors.push({ row: idx, type: 'format', message: '列数が3ではありません' });
                        return;
                    }
                    const [pc, ext, seat] = cols.map(c => this.normalizeToken(c));
                    if (this.containsIllegalChars(pc) || this.containsIllegalChars(ext) || this.containsIllegalChars(seat)) {
                        localErrors.push({ row: idx, type: 'illegal', message: '値内にカンマ/改行/二重引用符は使用できません' });
                    }
                    records.push({ pc, ext, seat, sourceRow: idx });
                });
            } else {
                // フィールド一括更新モード
                const ledger = this.getTargetLedgerName();
                const pkField = ledger === 'PC台帳' ? 'PC番号' : (ledger === '内線台帳' ? '内線番号' : '座席番号');
                const selectedFields = this.getSelectedFieldCodes();
                if (!selectedFields || selectedFields.length === 0) {
                    this.hideProgress();
                    this.showErrorPanel(['更新フィールドを1つ以上選択してください']);
                    return;
                }
                const expectedCols = 1 + selectedFields.length;
                lines.forEach((line, idx) => {
                    const cols = this.splitColumns(line);
                    if (cols.length !== expectedCols) {
                        localErrors.push({ row: idx, type: 'format', message: `列数が${expectedCols}ではありません（実際:${cols.length}）` });
                        return;
                    }
                    const norm = cols.map(c => this.normalizeToken(c));
                    if (norm.some(v => this.containsIllegalChars(v))) {
                        localErrors.push({ row: idx, type: 'illegal', message: '値内にカンマ/改行/二重引用符は使用できません' });
                    }
                    const pkVal = norm[0];
                    const body = {};
                    selectedFields.forEach((f, i) => { body[f] = norm[i + 1]; });
                    // recordsの形式は共通化のためpc/ext/seatプロパティを流用
                    const rec = { pc: '', ext: '', seat: '', sourceRow: idx, _pkField: pkField, _pkValue: pkVal, _ledger: ledger, _updates: body };
                    if (pkField === 'PC番号') rec.pc = pkVal; else if (pkField === '内線番号') rec.ext = pkVal; else rec.seat = pkVal;
                    records.push(rec);
                });
            }
            if (records.length === 0) {
                this.hideProgress();
                this.showErrorPanel(['有効な行がありません']);
                return;
            }

            // ① 貼り付けデータ
            try {
                console.groupCollapsed('① 貼り付けデータ');
                console.table(records);
                console.groupEnd();
            } catch (e) { /* noop */ }

            // 重複検出（貼り付け内）
            const dup = this.findDuplicates(records);
            try {
                const msgs = [];
                if (dup && dup.pc && dup.pc.size > 0) msgs.push(`貼り付け内のPC番号重複: ${Array.from(dup.pc).join(', ')}`);
                if (dup && dup.ext && dup.ext.size > 0) msgs.push(`貼り付け内の内線番号重複: ${Array.from(dup.ext).join(', ')}`);
                if (dup && dup.seat && dup.seat.size > 0) msgs.push(`貼り付け内の座席番号重複: ${Array.from(dup.seat).join(', ')}`);
                if (msgs.length > 0) {
                    this.showErrorPanel(['重複が見つかりました。', ...msgs, '一覧の表示を中止しました。']);
                    this.hideProgress();
                    return; // 重複あり → 仮想スクロールを表示しない
                }
            } catch (e) { /* noop */ }

            this.showProgress(CONFIG.bulkUpdate?.progressMessages?.validating || '存在確認中...');
            const existMap = await this.checkExistence(records);

            // 存在しない主キーが1つでもあれば、一覧表示をブロック
            try {
                const missing = { pc: new Set(), ext: new Set(), seat: new Set() };
                records.forEach(r => {
                    if (r.pc && !existMap.pc.has(r.pc)) missing.pc.add(r.pc);
                    if (r.ext && !existMap.ext.has(r.ext)) missing.ext.add(r.ext);
                    if (r.seat && !existMap.seat.has(r.seat)) missing.seat.add(r.seat);
                });
                const missCounts = {
                    pc: missing.pc.size,
                    ext: missing.ext.size,
                    seat: missing.seat.size
                };
                const hasMissing = missCounts.pc + missCounts.ext + missCounts.seat > 0;
                if (hasMissing) {
                    const msgs = [];
                    if (missCounts.pc) msgs.push(`存在しないPC番号: ${Array.from(missing.pc).join(', ')}`);
                    if (missCounts.ext) msgs.push(`存在しない内線番号: ${Array.from(missing.ext).join(', ')}`);
                    if (missCounts.seat) msgs.push(`存在しない座席番号: ${Array.from(missing.seat).join(', ')}`);
                    this.showErrorPanel(['存在しないキーが含まれています。', ...msgs, '一覧の表示を中止しました。']);
                    this.hideProgress();
                    return;
                }
            } catch (e) { /* noop */ }

            // フィールド一括更新モード: ドロップダウン選択肢チェック
            if (this.mode === 'fields') {
                const ledger = this.getTargetLedgerName();
                const appId = CONFIG.getAppIdByLedgerName(ledger);
                const fields = await window.fieldInfoAPI.getAppFields(appId);
                const optionMap = new Map(); // code -> Set(options)
                const selected = new Set(this.getSelectedFieldCodes());
                fields.forEach(f => {
                    if (selected.has(f.code) && f.type === 'dropdown' && Array.isArray(f.options)) {
                        optionMap.set(f.code, new Set(f.options.map(o => String(o))));
                    }
                });
                const invalids = [];
                if (optionMap.size > 0) {
                    records.forEach((r, idx) => {
                        const body = r._updates || {};
                        Object.entries(body).forEach(([code, val]) => {
                            if (!optionMap.has(code)) return;
                            const v = String(val || '').trim();
                            if (v === '') return; // 空欄は許容（後続の既存バリデーションに委ねる）
                            if (!optionMap.get(code).has(v)) {
                                invalids.push(`${idx + 1}行目: ${code} = "${v}"（未定義の選択肢）`);
                            }
                        });
                    });
                }
                if (invalids.length > 0) {
                    this.showErrorPanel(['選択肢に存在しない値があります。', ...invalids.slice(0, 30)]);
                    this.hideProgress();
                    return;
                }
                // フィールド更新用のコンテキストを保存
                const pkField = ledger === 'PC台帳' ? 'PC番号' : (ledger === '内線台帳' ? '内線番号' : '座席番号');
                const valueMap = new Map();
                records.forEach(r => { valueMap.set(r._pkValue, r._updates || {}); });
                this._fieldUpdateContext = { mode: 'fields', ledger, pkField, selectedFields: Array.from(selected), valueMap };
            } else {
                this._fieldUpdateContext = null;
            }

            // 影響行抽出のため、必要な既存レコードを取得
            this.showProgress(CONFIG.bulkUpdate?.progressMessages?.building || '影響行抽出中...');
            const affected = await this.buildAffectedUniverse(records, existMap);

            // 統合行の生成
            const integrated = await this.buildIntegratedAfterState(records, affected);

            // 表示
            if (window.tableRenderer) {
                window.tableRenderer.displayIntegratedTable('bulk', integrated);
                // 保存用の"変更前"スナップショットを、表示直後に差し替え（Bulkの再置換前状態）
                try {
                    if (this._beforeIntegrated && Array.isArray(this._beforeIntegrated)) {
                        window.tableRenderer._originalIntegratedData = this._beforeIntegrated.map(r => {
                            try { return JSON.parse(JSON.stringify(r)); } catch (e) { return { ...r }; }
                        });
                    }
                } catch (e) { /* noop */ }
            }

            // 表示直後に変更セルハイライトと事前エラー付与、既存バリデーション
            setTimeout(async () => {
                try {
                    this.applyChangedHighlights(records, integrated);
                    // 先に既存の全行バリデーションを実行（ここでUIをクリーンアップ）
                    await this.revalidateAll();
                    // その後に事前チェック（存在/重複）エラーをセルに付与 → バリデーションで上書きされない
                    this.applyPrecheckErrors(records, dup, existMap, integrated);
                } catch (e) { /* noop */ }
                this.hideProgress();
            }, 0);

        } catch (error) {
            this.hideProgress();
            alert(`取り込み中にエラーが発生しました\n${error?.message || error}`);
            console.error(error);
        }
    }

    splitLines(text) {
        return String(text || '')
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(Boolean);
    }

    splitColumns(line) {
        // 優先: タブ, 次: カンマ, 次: スペース（1個以上）。値内のカンマ/改行は非許容。
        if (line.includes('\t')) return line.split('\t');
        if (line.includes(',')) return line.split(',');
        // 連続スペースも1区切りとして扱う
        return line.trim().split(/\s+/);
    }

    normalizeToken(v) {
        if (v == null) return '';
        let s = String(v).trim();
        // 全角スペース→半角
        s = s.replace(/\u3000/g, ' ');
        // 全角英数記号を半角へ（基本ラテン）
        s = s.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
        return s;
    }

    containsIllegalChars(v) {
        const s = String(v || '');
        // 値内カンマ/改行/二重引用符は不可
        return /[,\n\r\"]/.test(s);
    }

    findDuplicates(rows) {
        const dup = { pc: new Set(), ext: new Set(), seat: new Set() };
        const seen = { pc: new Set(), ext: new Set(), seat: new Set() };
        rows.forEach(r => {
            if (r.pc) {
                if (seen.pc.has(r.pc)) dup.pc.add(r.pc); else seen.pc.add(r.pc);
            }
            if (r.ext) {
                if (seen.ext.has(r.ext)) dup.ext.add(r.ext); else seen.ext.add(r.ext);
            }
            if (r.seat) {
                if (seen.seat.has(r.seat)) dup.seat.add(r.seat); else seen.seat.add(r.seat);
            }
        });
        return dup;
    }

    async checkExistence(rows) {
        const uniq = {
            pc: Array.from(new Set(rows.map(r => r.pc).filter(Boolean))),
            ext: Array.from(new Set(rows.map(r => r.ext).filter(Boolean))),
            seat: Array.from(new Set(rows.map(r => r.seat).filter(Boolean)))
        };
        const quote = (v) => '"' + String(v).replace(/"/g, '""') + '"';
        const exist = { pc: new Set(), ext: new Set(), seat: new Set(), maps: {} };
        exist.maps.pc = new Map();
        exist.maps.ext = new Map();
        exist.maps.seat = new Map();
        // PC
        if (uniq.pc.length > 0) {
            const q = `${CONFIG.masters.pc.fieldCode} in (${uniq.pc.map(quote).join(',')})`;
            const recs = await window.searchEngine.searchRecordsWithQuery(CONFIG.masters.pc.appId, q);
            recs.forEach(rec => {
                const v = rec[CONFIG.masters.pc.fieldCode]?.value || rec[CONFIG.masters.pc.fieldCode] || '';
                if (v) { exist.pc.add(String(v)); exist.maps.pc.set(String(v), rec); }
            });
        }
        // EXT
        if (uniq.ext.length > 0) {
            const q = `${CONFIG.masters.ext.fieldCode} in (${uniq.ext.map(quote).join(',')})`;
            const recs = await window.searchEngine.searchRecordsWithQuery(CONFIG.masters.ext.appId, q);
            recs.forEach(rec => {
                const v = rec[CONFIG.masters.ext.fieldCode]?.value || rec[CONFIG.masters.ext.fieldCode] || '';
                if (v) { exist.ext.add(String(v)); exist.maps.ext.set(String(v), rec); }
            });
        }
        // SEAT
        if (uniq.seat.length > 0) {
            const q = `${CONFIG.masters.seat.fieldCode} in (${uniq.seat.map(quote).join(',')})`;
            const recs = await window.searchEngine.searchRecordsWithQuery(CONFIG.masters.seat.appId, q);
            recs.forEach(rec => {
                const v = rec[CONFIG.masters.seat.fieldCode]?.value || rec[CONFIG.masters.seat.fieldCode] || '';
                if (v) { exist.seat.add(String(v)); exist.maps.seat.set(String(v), rec); }
            });
        }
        return exist;
    }

    async buildAffectedUniverse(rows, existMap) {
        // 仕様③: 各集合で各台帳の3フィールドをOR検索
        const pcs = Array.from(new Set(rows.map(r => r.pc).filter(Boolean)));
        const exts = Array.from(new Set(rows.map(r => r.ext).filter(Boolean)));
        const seats = Array.from(new Set(rows.map(r => r.seat).filter(Boolean)));

        const quote = (v) => '"' + String(v).replace(/"/g, '""') + '"';
        const inList = (arr) => arr.length ? '(' + arr.map(quote).join(',') + ')' : '';
        const orIf = (cond, list) => list ? cond : '';
        const joinOr = (arr) => arr.filter(Boolean).join(' or ');

        const allLedgerData = {};

        // PC台帳: PC番号 / 内線番号 / 座席番号
        {
            const parts = [];
            if (pcs.length)  parts.push(`${CONFIG.masters.pc.fieldCode} in ${inList(pcs)}`);
            if (exts.length) parts.push(`${CONFIG.masters.ext.fieldCode} in ${inList(exts)}`);
            if (seats.length) parts.push(`${CONFIG.masters.seat.fieldCode} in ${inList(seats)}`);
            const q = joinOr(parts);
            allLedgerData[CONFIG.masters.pc.appId] = q ? await window.searchEngine.searchRecordsWithQuery(CONFIG.masters.pc.appId, q) : [];
        }

        // 内線台帳: PC番号 / 内線番号 / 座席番号
        {
            const parts = [];
            if (pcs.length)  parts.push(`${CONFIG.masters.pc.fieldCode} in ${inList(pcs)}`);
            if (exts.length) parts.push(`${CONFIG.masters.ext.fieldCode} in ${inList(exts)}`);
            if (seats.length) parts.push(`${CONFIG.masters.seat.fieldCode} in ${inList(seats)}`);
            const q = joinOr(parts);
            allLedgerData[CONFIG.masters.ext.appId] = q ? await window.searchEngine.searchRecordsWithQuery(CONFIG.masters.ext.appId, q) : [];
        }

        // 座席台帳: PC番号 / 内線番号 / 座席番号
        {
            const parts = [];
            if (pcs.length)  parts.push(`${CONFIG.masters.pc.fieldCode} in ${inList(pcs)}`);
            if (exts.length) parts.push(`${CONFIG.masters.ext.fieldCode} in ${inList(exts)}`);
            if (seats.length) parts.push(`${CONFIG.masters.seat.fieldCode} in ${inList(seats)}`);
            const q = joinOr(parts);
            allLedgerData[CONFIG.masters.seat.appId] = q ? await window.searchEngine.searchRecordsWithQuery(CONFIG.masters.seat.appId, q) : [];
        }

        // ② 抽出データ（各台帳の主要フィールドを表示）
        try {
            const summarize = (recs) => (recs || []).map(r => ({
                id: (r['$id'] && r['$id'].value !== undefined) ? r['$id'].value : (r['$id'] || ''),
                PC番号: r['PC番号']?.value ?? r['PC番号'] ?? '',
                内線番号: r['内線番号']?.value ?? r['内線番号'] ?? '',
                座席番号: r['座席番号']?.value ?? r['座席番号'] ?? '',
                統合キー: r[CONFIG.integrationKey]?.value ?? r[CONFIG.integrationKey] ?? ''
            }));
            console.groupCollapsed('② 抽出データ（allLedgerData）');
            console.log('PC台帳', summarize(allLedgerData[CONFIG.masters.pc.appId]));
            console.log('内線台帳', summarize(allLedgerData[CONFIG.masters.ext.appId]));
            console.log('座席台帳', summarize(allLedgerData[CONFIG.masters.seat.appId]));
            console.groupEnd();
        } catch (e) { /* noop */ }

        return allLedgerData;
    }

    async buildIntegratedAfterState(rows, allLedgerData) {
        // 1) 事前統合（before）
        const userListData = await window.dataIntegrator.searchUserListByUserIds(allLedgerData);
        const beforeIntegrated = await window.dataIntegrator.integrateAllLedgerDataWithUserList(allLedgerData, [], userListData);
        // 保存前差分の基準として保持（runImport→表示直後で反映）
        try { this._beforeIntegrated = beforeIntegrated.map(r => JSON.parse(JSON.stringify(r))); } catch (e) { this._beforeIntegrated = beforeIntegrated.map(r => ({ ...r })); }

        // 2) レコードレベルで ④クリア → ⑤再割当
        const getAppId = (ledgerName) => Object.keys(CONFIG.apps).find(id => CONFIG.apps[id].name === ledgerName);
        const pcAppId   = getAppId('PC台帳');
        const extAppId  = getAppId('内線台帳');
        const seatAppId = getAppId('座席台帳');
        const pcRecs   = Array.isArray(allLedgerData[pcAppId]) ? allLedgerData[pcAppId] : [];
        const extRecs  = Array.isArray(allLedgerData[extAppId]) ? allLedgerData[extAppId] : [];
        const seatRecs = Array.isArray(allLedgerData[seatAppId]) ? allLedgerData[seatAppId] : [];

        const read = (rec, code) => {
            const v = rec[code];
            return (v && v.value !== undefined) ? String(v.value) : String(v || '');
        };
        const write = (rec, code, value) => {
            if (rec[code] && typeof rec[code] === 'object' && 'value' in rec[code]) rec[code].value = value; else rec[code] = { value: value };
        };
        const idOf = (rec) => {
            const v = rec['$id'];
            const s = (v && v.value !== undefined) ? String(v.value) : String(v || '0');
            return parseInt(s, 10) || 0;
        };

        const pcSet = new Set(rows.map(r => r.pc).filter(Boolean));
        const extSet = new Set(rows.map(r => r.ext).filter(Boolean));
        const seatSet = new Set(rows.map(r => r.seat).filter(Boolean));
        // 旧配置マップ（クリア前の状態で確定）
        const oldSeatByPc  = new Map(pcRecs.map(r => [read(r,'PC番号'), read(r,'座席番号')]));
        const oldSeatByExt = new Map(extRecs.map(r => [read(r,'内線番号'), read(r,'座席番号')]));
        const oldPcBySeat  = new Map(seatRecs.map(r => [read(r,'座席番号'), read(r,'PC番号')]));
        const oldExtBySeat = new Map(seatRecs.map(r => [read(r,'座席番号'), read(r,'内線番号')]));
        const changedLog = [];

        // ④ クリア（アンカー別クリアマトリクス）
        // 要件:
        //  - PC番号が貼り付け集合に含まれる場合:
        //      PC台帳: 内線番号・座席番号を削除
        //      内線台帳: PC番号のみ削除
        //      座席台帳: PC番号のみ削除
        //  - 内線番号が貼り付け集合に含まれる場合:
        //      PC台帳: 内線番号のみ削除
        //      内線台帳: PC番号・座席番号を削除
        //      座席台帳: 内線番号のみ削除
        //  - 座席番号が貼り付け集合に含まれる場合:
        //      PC台帳: 座席番号のみ削除
        //      内線台帳: 座席番号のみ削除
        //      座席台帳: PC番号・内線番号を削除

        // フィールド一括更新モードでは紐づけ変更（クリア）は行わない
        const isFieldUpdateMode = !!(this._fieldUpdateContext && this._fieldUpdateContext.mode === 'fields');
        // PCアンカー: 貼り付けPC集合に含まれるPC番号を持つ全レコードへ適用
        if (!isFieldUpdateMode && pcSet.size > 0) {
            const pcIsTarget = (rec) => pcSet.has(read(rec, 'PC番号'));
            // PC台帳: 内線番号・座席番号を空欄
            pcRecs.forEach(rec => {
                if (!pcIsTarget(rec)) return;
                if (read(rec, '内線番号') !== '') { write(rec, '内線番号', ''); changedLog.push({ ledger: 'PC台帳', id: idOf(rec), key: '内線台帳_内線番号' }); }
                if (read(rec, '座席番号') !== '') { write(rec, '座席番号', ''); changedLog.push({ ledger: 'PC台帳', id: idOf(rec), key: '座席台帳_座席番号' }); }
            });
            // 内線台帳: PC番号のみ空欄
            extRecs.forEach(rec => {
                if (!pcIsTarget(rec)) return;
                if (read(rec, 'PC番号') !== '') { write(rec, 'PC番号', ''); changedLog.push({ ledger: '内線台帳', id: idOf(rec), key: 'PC台帳_PC番号' }); }
            });
            // 座席台帳: PC番号のみ空欄
            seatRecs.forEach(rec => {
                if (!pcIsTarget(rec)) return;
                if (read(rec, 'PC番号') !== '') { write(rec, 'PC番号', ''); changedLog.push({ ledger: '座席台帳', id: idOf(rec), key: 'PC台帳_PC番号' }); }
            });
        }

        // EXTアンカー
        if (!isFieldUpdateMode && extSet.size > 0) {
            const extIsTarget = (rec) => extSet.has(read(rec, '内線番号'));
            // PC台帳: 内線番号のみ空欄
            pcRecs.forEach(rec => {
                if (!extIsTarget(rec)) return;
                if (read(rec, '内線番号') !== '') { write(rec, '内線番号', ''); changedLog.push({ ledger: 'PC台帳', id: idOf(rec), key: '内線台帳_内線番号' }); }
            });
            // 内線台帳: PC番号・座席番号を空欄
            extRecs.forEach(rec => {
                if (!extIsTarget(rec)) return;
                if (read(rec, 'PC番号') !== '') { write(rec, 'PC番号', ''); changedLog.push({ ledger: '内線台帳', id: idOf(rec), key: 'PC台帳_PC番号' }); }
                if (read(rec, '座席番号') !== '') { write(rec, '座席番号', ''); changedLog.push({ ledger: '内線台帳', id: idOf(rec), key: '座席台帳_座席番号' }); }
            });
            // 座席台帳: 内線番号のみ空欄
            seatRecs.forEach(rec => {
                if (!extIsTarget(rec)) return;
                if (read(rec, '内線番号') !== '') { write(rec, '内線番号', ''); changedLog.push({ ledger: '座席台帳', id: idOf(rec), key: '内線台帳_内線番号' }); }
            });
        }

        // SEATアンカー
        if (!isFieldUpdateMode && seatSet.size > 0) {
            const seatIsTarget = (rec) => seatSet.has(read(rec, '座席番号'));
            // PC台帳: 座席番号のみ空欄
            pcRecs.forEach(rec => {
                if (!seatIsTarget(rec)) return;
                if (read(rec, '座席番号') !== '') { write(rec, '座席番号', ''); changedLog.push({ ledger: 'PC台帳', id: idOf(rec), key: '座席台帳_座席番号' }); }
            });
            // 内線台帳: 座席番号のみ空欄
            extRecs.forEach(rec => {
                if (!seatIsTarget(rec)) return;
                if (read(rec, '座席番号') !== '') { write(rec, '座席番号', ''); changedLog.push({ ledger: '内線台帳', id: idOf(rec), key: '座席台帳_座席番号' }); }
            });
            // 座席台帳: PC番号・内線番号を空欄
            seatRecs.forEach(rec => {
                if (!seatIsTarget(rec)) return;
                if (read(rec, 'PC番号') !== '') { write(rec, 'PC番号', ''); changedLog.push({ ledger: '座席台帳', id: idOf(rec), key: 'PC台帳_PC番号' }); }
                if (read(rec, '内線番号') !== '') { write(rec, '内線番号', ''); changedLog.push({ ledger: '座席台帳', id: idOf(rec), key: '内線台帳_内線番号' }); }
            });
        }

        // ③ 空欄化後スナップショット
        try {
            const snap = (list) => list.map(r => ({ id: idOf(r), PC番号: read(r,'PC番号'), 内線番号: read(r,'内線番号'), 座席番号: read(r,'座席番号') }));
            console.groupCollapsed('③ 空欄化後データ');
            console.log('PC台帳', snap(pcRecs));
            console.log('内線台帳', snap(extRecs));
            console.log('座席台帳', snap(seatRecs));
            console.groupEnd();
        } catch (e) { /* noop */ }

        // ⑤ 再割当（先勝ち: $id昇順）
        const firstByValue = (list, code, value) => {
            const filtered = list.filter(r => read(r, code) === String(value));
            if (filtered.length === 0) return null;
            return filtered.sort((a, b) => idOf(a) - idOf(b))[0];
        };
        if (!isFieldUpdateMode) {
            rows.forEach(({ pc, ext, seat }) => {
                if (pc) {
                    const r = firstByValue(pcRecs, 'PC番号', pc);
                    if (r) {
                        if (ext !== undefined) { write(r, '内線番号', ext || ''); changedLog.push({ ledger: 'PC台帳', id: idOf(r), key: '内線台帳_内線番号' }); }
                        if (seat !== undefined) { write(r, '座席番号', seat || ''); changedLog.push({ ledger: 'PC台帳', id: idOf(r), key: '座席台帳_座席番号' }); }
                    }
                }
                if (ext) {
                    const r = firstByValue(extRecs, '内線番号', ext);
                    if (r) {
                        if (pc !== undefined) { write(r, 'PC番号', pc || ''); changedLog.push({ ledger: '内線台帳', id: idOf(r), key: 'PC台帳_PC番号' }); }
                        if (seat !== undefined) { write(r, '座席番号', seat || ''); changedLog.push({ ledger: '内線台帳', id: idOf(r), key: '座席台帳_座席番号' }); }
                    }
                }
                if (seat) {
                    const r = firstByValue(seatRecs, '座席番号', seat);
                    if (r) {
                        if (pc !== undefined) { write(r, 'PC番号', pc || ''); changedLog.push({ ledger: '座席台帳', id: idOf(r), key: 'PC台帳_PC番号' }); }
                        if (ext !== undefined) { write(r, '内線番号', ext || ''); changedLog.push({ ledger: '座席台帳', id: idOf(r), key: '内線台帳_内線番号' }); }
                    }
                }
            });
        }

        // ⑤-2 フィールド一括更新モードの反映（選択フィールドを上書き）
        if (this._fieldUpdateContext && this._fieldUpdateContext.mode === 'fields') {
            const { ledger, pkField, selectedFields, valueMap } = this._fieldUpdateContext;
            const targetList = ledger === 'PC台帳' ? pcRecs : (ledger === '内線台帳' ? extRecs : seatRecs);
            targetList.forEach(rec => {
                const pkVal = read(rec, pkField);
                if (!pkVal || !valueMap.has(pkVal)) return;
                const updates = valueMap.get(pkVal) || {};
                selectedFields.forEach(code => {
                    if (!(code in updates)) return;
                    const before = read(rec, code);
                    const after  = String(updates[code] ?? '');
                    if (before === after) return;
                    write(rec, code, after);
                    changedLog.push({ ledger, id: idOf(rec), key: `${ledger}_${code}` });
                });
            });
        }

        // ④-1 残置ペアリング（旧座席でPCと内線を結合）
        // 一時無効化（検証目的）
        // try {
        //     const paired = [];
        //     // PC側からEXTへ
        //     pcRecs.forEach(pRec => {
        //         const pcNo = read(pRec, 'PC番号');
        //         if (!pcNo) return;
        //         const pcBlank = (read(pRec,'内線番号') === '' && read(pRec,'座席番号') === '');
        //         if (!pcBlank) return;
        //         const oldSeat = oldSeatByPc.get(pcNo) || '';
        //         if (!oldSeat) return;
        //         const extNo = oldExtBySeat.get(oldSeat) || '';
        //         if (!extNo) return;
        //         // 貼り付けに内線番号指定がない場合はペアリングしない（PCのみ分離意図）
        //         if (!extSet.has(extNo)) return;
        //         const eRec = extRecs.find(r => read(r,'内線番号') === extNo);
        //         if (!eRec) return;
        //         const extBlank = (read(eRec,'PC番号') === '' && read(eRec,'座席番号') === '');
        //         if (!extBlank) return;
        //         write(pRec, '内線番号', extNo); changedLog.push({ ledger: 'PC台帳', id: idOf(pRec), key: '内線台帳_内線番号' });
        //         write(eRec, 'PC番号', pcNo);  changedLog.push({ ledger: '内線台帳', id: idOf(eRec), key: 'PC台帳_PC番号' });
        //         paired.push({ type:'PC→EXT', pc: pcNo, ext: extNo, seat: oldSeat });
        //     });
        //     // EXT側からPCへ（対称）
        //     extRecs.forEach(eRec => {
        //         const extNo = read(eRec, '内線番号');
        //         if (!extNo) return;
        //         const extBlank = (read(eRec,'PC番号') === '' && read(eRec,'座席番号') === '');
        //         if (!extBlank) return;
        //         const oldSeat = oldSeatByExt.get(extNo) || '';
        //         if (!oldSeat) return;
        //         const pcNo = oldPcBySeat.get(oldSeat) || '';
        //         if (!pcNo) return;
        //         // 貼り付けにPC番号指定がない場合はペアリングしない（内線のみ分離意図）
        //         if (!pcSet.has(pcNo)) return;
        //         const pRec = pcRecs.find(r => read(r,'PC番号') === pcNo);
        //         if (!pRec) return;
        //         const pcBlank = (read(pRec,'内線番号') === '' && read(pRec,'座席番号') === '');
        //         if (!pcBlank) return;
        //         write(eRec, 'PC番号', pcNo);  changedLog.push({ ledger: '内線台帳', id: idOf(eRec), key: 'PC台帳_PC番号' });
        //         write(pRec, '内線番号', extNo); changedLog.push({ ledger: 'PC台帳', id: idOf(pRec), key: '内線台帳_内線番号' });
        //         paired.push({ type:'EXT→PC', pc: pcNo, ext: extNo, seat: oldSeat });
        //     });
        //     // ログ
        //     console.groupCollapsed('④-1 残置ペアリング適用（無効化中）');
        //     console.table(paired);
        //     console.groupEnd();
        // } catch (e) { /* noop */ }

        // ④ 再割当後スナップショット
        try {
            const snap = (list) => list.map(r => ({ id: idOf(r), PC番号: read(r,'PC番号'), 内線番号: read(r,'内線番号'), 座席番号: read(r,'座席番号') }));
            console.groupCollapsed('④ 再割当後データ');
            console.log('PC台帳', snap(pcRecs));
            console.log('内線台帳', snap(extRecs));
            console.log('座席台帳', snap(seatRecs));
            console.groupEnd();
        } catch (e) { /* noop */ }

        // 3) 統合キー再構築
        const rebuildKey = (pc, ext, seat) => `PC:${pc || ''}|EXT:${ext || ''}|SEAT:${seat || ''}`;
        pcRecs.forEach(rec => write(rec, CONFIG.integrationKey, rebuildKey(read(rec, 'PC番号'), read(rec, '内線番号'), read(rec, '座席番号'))));
        extRecs.forEach(rec => write(rec, CONFIG.integrationKey, rebuildKey(read(rec, 'PC番号'), read(rec, '内線番号'), read(rec, '座席番号'))));
        seatRecs.forEach(rec => write(rec, CONFIG.integrationKey, rebuildKey(read(rec, 'PC番号'), read(rec, '内線番号'), read(rec, '座席番号'))));

        // 4) 再統合（after）
        const afterIntegrated = await window.dataIntegrator.integrateAllLedgerDataWithUserList(allLedgerData, [], userListData);

        // 表示・保存のソース列を揃える（cross-ledger主キー列を自台帳の表示列にも反映）
        afterIntegrated.forEach(row => {
            // PC台帳の表示列を cross 主キーから反映
            if (row.hasOwnProperty('座席台帳_座席番号')) row['PC台帳_座席番号'] = row['座席台帳_座席番号'];
            if (row.hasOwnProperty('内線台帳_内線番号')) row['PC台帳_内線番号'] = row['内線台帳_内線番号'];
            // 内線台帳の表示列を cross 主キーから反映
            if (row.hasOwnProperty('PC台帳_PC番号')) row['内線台帳_PC番号'] = row['PC台帳_PC番号'];
            if (row.hasOwnProperty('座席台帳_座席番号')) row['内線台帳_座席番号'] = row['座席台帳_座席番号'];
            // 座席台帳の表示列を cross 主キーから反映
            if (row.hasOwnProperty('PC台帳_PC番号')) row['座席台帳_PC番号'] = row['PC台帳_PC番号'];
            if (row.hasOwnProperty('内線台帳_内線番号')) row['座席台帳_内線番号'] = row['内線台帳_内線番号'];
        });

        // 5) 差分 → ハイライト対象に変換
        const toIdx = (ledger, id) => afterIntegrated.findIndex(r => String(r[`${ledger}_$id`]) === String(id));
        const diff = [];
        changedLog.forEach(ch => {
            const idx = toIdx(ch.ledger, ch.id);
            if (idx >= 0) diff.push({ index: idx, fieldKey: ch.key });
        });
        this._lastDiff = diff;

        // ⑤ 予測 更新リクエストデータ（保存時に送られる形に近い構造）
        try {
            const appIdOf = (ledger) => Object.keys(CONFIG.apps).find(id => CONFIG.apps[id].name === ledger);
            const fieldFromCross = (ledger, crossKey) => {
                if (ledger === 'PC台帳') {
                    if (/_座席番号$/.test(crossKey)) return '座席番号';
                    if (/_内線番号$/.test(crossKey)) return '内線番号';
                } else if (ledger === '内線台帳') {
                    if (/_PC番号$/.test(crossKey)) return 'PC番号';
                    if (/_座席番号$/.test(crossKey)) return '座席番号';
                } else if (ledger === '座席台帳') {
                    if (/_PC番号$/.test(crossKey)) return 'PC番号';
                    if (/_内線番号$/.test(crossKey)) return '内線番号';
                }
                return null;
            };
            const valueFromCross = (row, crossKey) => row[crossKey] ?? '';
            const byLedger = new Map();
            (this._lastDiff || []).forEach(d => {
                const row = afterIntegrated[d.index];
                const ledger = (d.fieldKey.split('_')[0]);
                const fieldCode = fieldFromCross(ledger, d.fieldKey);
                const appId = appIdOf(ledger);
                const recordId = row[`${ledger}_$id`];
                if (!fieldCode || !appId || !recordId) return;
                const key = `${appId}:${recordId}`;
                if (!byLedger.has(key)) byLedger.set(key, { app: appId, id: recordId, record: {} });
                byLedger.get(key).record[fieldCode] = { value: valueFromCross(row, d.fieldKey) };
            });
            console.groupCollapsed('⑤ 予測 更新リクエストデータ');
            console.log(Array.from(byLedger.values()));
            console.groupEnd();
        } catch (e) { /* noop */ }

        return afterIntegrated;
    }

    applyChangedHighlights(rows, integrated) {
        if (!window.virtualScroll || !window.tableRenderer) return;
        (this._lastDiff || []).forEach(d => this.markChanged(d.index, d.fieldKey));
    }

    markChanged(recordIndex, fieldKey) {
        try {
            if (!window.virtualScroll) return;
            // 変更フラグ・セル強調
            window.virtualScroll.setChangedField(recordIndex, fieldKey);
            window.virtualScroll.setCellChangedStyle(recordIndex, fieldKey);
            window.virtualScroll.setChangeFlag(recordIndex, true);
        } catch (e) { /* noop */ }
    }

    applyPrecheckErrors(rows, dup, existMap, integrated) {
        if (!window.validation || !window.tableRenderer) return;
        const idxOf = (pred) => window.tableRenderer.currentSearchResults.findIndex(pred);
        const findAnchorIndex = (r, order) => {
            for (const anchor of order) {
                if (anchor === 'pc' && r.pc) {
                    const i = idxOf(it => it && it['PC台帳_PC番号'] === r.pc);
                    if (i >= 0) return i;
                }
                if (anchor === 'ext' && r.ext) {
                    const i = idxOf(it => it && it['内線台帳_内線番号'] === r.ext);
                    if (i >= 0) return i;
                }
                if (anchor === 'seat' && r.seat) {
                    const i = idxOf(it => it && it['座席台帳_座席番号'] === r.seat);
                    if (i >= 0) return i;
                }
            }
            return -1;
        };
        let notFoundPc = 0, notFoundExt = 0, notFoundSeat = 0;

        // 存在チェック: PC/EXT/SEAT（アンカー欠如時はフォールバック順で付与）
        rows.forEach(r => {
            if (r.pc && !existMap.pc.has(r.pc)) {
                const idx = findAnchorIndex(r, ['pc', 'seat', 'ext']);
                if (idx >= 0) window.validation.markInvalid(idx, 'PC台帳_PC番号', ['存在しないPC番号']);
                notFoundPc++;
            }
            if (r.ext && !existMap.ext.has(r.ext)) {
                const idx = findAnchorIndex(r, ['ext', 'pc', 'seat']);
                if (idx >= 0) window.validation.markInvalid(idx, '内線台帳_内線番号', ['存在しない内線番号']);
                notFoundExt++;
            }
            if (r.seat && !existMap.seat.has(r.seat)) {
                const idx = findAnchorIndex(r, ['seat', 'pc', 'ext']);
                if (idx >= 0) window.validation.markInvalid(idx, '座席台帳_座席番号', ['存在しない座席番号']);
                notFoundSeat++;
            }
        });

        // 重複: それぞれの台帳の主キーセルをエラー
        dup.pc.forEach(v => {
            const idx = idxOf(it => it && it['PC台帳_PC番号'] === v);
            if (idx >= 0) window.validation.markInvalid(idx, 'PC台帳_PC番号', ['貼り付け内で重複']);
        });
        dup.ext.forEach(v => {
            const idx = idxOf(it => it && it['内線台帳_内線番号'] === v);
            if (idx >= 0) window.validation.markInvalid(idx, '内線台帳_内線番号', ['貼り付け内で重複']);
        });
        dup.seat.forEach(v => {
            const idx = idxOf(it => it && it['座席台帳_座席番号'] === v);
            if (idx >= 0) window.validation.markInvalid(idx, '座席台帳_座席番号', ['貼り付け内で重複']);
        });

        // サマリ通知（視認性向上）
        try {
            const parts = [];
            if (notFoundPc > 0) parts.push(`PC番号: ${notFoundPc}件`);
            if (notFoundExt > 0) parts.push(`内線番号: ${notFoundExt}件`);
            if (notFoundSeat > 0) parts.push(`座席番号: ${notFoundSeat}件`);
            if (parts.length > 0 && window.tableRenderer) {
                window.tableRenderer.showToast(`存在しない主キーがあります（${parts.join(' / ')}）。セルの赤枠を確認してください。`, 'error');
            }
        } catch (e) { /* noop */ }
    }

    async revalidateAll() {
        if (!window.validation || !window.tableRenderer) return;
        const rows = window.tableRenderer.currentSearchResults || [];
        for (let i = 0; i < rows.length; i++) {
            try { await window.validation.validateRow(i); } catch (e) { /* noop */ }
        }
    }

    showProgress(message) {
        try {
            const results = document.getElementById(CONFIG.system.resultsContainerId);
            if (!results) return;
            let box = results.querySelector('.loading-message');
            if (!box) {
                box = DOMHelper.createElement('div', {}, 'loading-message');
                results.innerHTML = '';
                results.appendChild(box);
            }
            box.textContent = message || '処理中...';
        } catch (e) { /* noop */ }
    }

    hideProgress() {
        try {
            const results = document.getElementById(CONFIG.system.resultsContainerId);
            if (!results) return;
            const box = results.querySelector('.loading-message');
            if (box) box.remove();
        } catch (e) { /* noop */ }
    }
}

// グローバル公開
window.BulkUpdate = BulkUpdate;


