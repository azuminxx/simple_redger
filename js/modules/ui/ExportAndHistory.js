/**
 * Export and History controller for the integrated table
 * - エクスポート（Excel/CSV）
 * - 履歴登録（History App への投入）
 */
class ExportAndHistory {
    constructor(tableRenderer) {
        this.tableRenderer = tableRenderer;
        // 履歴タブ用の簡易レンダリング先
        this.historyContainerSelector = '.history-container';
    }

    // エクスポート用カラムを台帳ごとにグループ化
    groupExportColumnsByLedger(columns) {
        const groups = [];
        let currentGroup = null;
        columns.forEach(column => {
            const ledgerName = column.ledger || DOMHelper.getLedgerNameFromKey(column.key);
            if (!currentGroup || currentGroup.ledgerName !== ledgerName) {
                currentGroup = { ledgerName, columns: [] };
                groups.push(currentGroup);
            }
            currentGroup.columns.push(column);
        });
        return groups;
    }

    // 検索結果をExcelファイルにエクスポート
    exportToExcel() {
        const tr = this.tableRenderer;
        if (!tr.currentSearchResults || tr.currentSearchResults.length === 0) {
            alert('エクスポートするデータがありません。');
            return;
        }
        try {
            const exportButton = document.querySelector('.export-data-button');
            if (exportButton) {
                exportButton.disabled = true;
                exportButton.textContent = 'エクスポート中...';
            }

            const exportColumns = [
                { key: '統合キー', label: '統合キー', ledger: '統合' },
                { key: 'consistency-check', label: '整合', ledger: '操作' },
                ...CONFIG.integratedTableConfig.columns.filter(col => !col.isChangeFlag && !col.isDetailLink && !col.isConsistencyCheck)
            ];

            const ledgerGroups = this.groupExportColumnsByLedger(exportColumns);

            const ledgerHeaderRow = ledgerGroups.map(group => {
                const cells = new Array(group.columns.length).fill(group.ledgerName);
                cells[0] = group.ledgerName;
                for (let i = 1; i < cells.length; i++) cells[i] = '';
                return cells;
            }).flat();

            const fieldHeaderRow = exportColumns.map(col => col.label);

            const data = tr.currentSearchResults.map(record => {
                return exportColumns.map(col => {
                    if (col.key === '統合キー') {
                        let integrationKey = null;
                        for (const appId in CONFIG.apps) {
                            const ledgerName = CONFIG.apps[appId].name;
                            const key = `${ledgerName}_${CONFIG.integrationKey}`;
                            if (record[key]) { integrationKey = record[key]; break; }
                        }
                        return integrationKey || '';
                    }
                    // if (col.key === 'consistency-check') {
                    //     let integrationKey = null;
                    //     for (const appId in CONFIG.apps) {
                    //         const ledgerName = CONFIG.apps[appId].name;
                    //         const key = `${ledgerName}_${CONFIG.integrationKey}`;
                    //         if (record[key]) { integrationKey = record[key]; break; }
                    //     }
                    //     if (integrationKey) {
                    //         const dataIntegrator = new window.DataIntegrator();
                    //         const parsed = dataIntegrator.parseIntegrationKey(integrationKey);
                    //         const pc = record['PC台帳_PC番号'] || '';
                    //         const ext = record['内線台帳_内線番号'] || '';
                    //         const seat = record['座席台帳_座席番号'] || '';
                    //         const isEmpty = v => v === null || v === undefined || v === '';
                    //         const isFieldConsistent = (a, b) => (isEmpty(a) && isEmpty(b)) || a === b;
                    //         const isConsistent = isFieldConsistent(parsed.PC, pc) && isFieldConsistent(parsed.EXT, ext) && isFieldConsistent(parsed.SEAT, seat);
                    //         return isConsistent ? '整合' : '不整合';
                    //     }
                    //     return '';
                    // }
                    const value = record[col.key];
                    if (value === null || value === undefined) return '';
                    if (Array.isArray(value)) return value.join(', ');
                    if (typeof value === 'object' && value.value !== undefined) return value.value || '';
                    return String(value);
                });
            });

            const csvContent = [ledgerHeaderRow, fieldHeaderRow, ...data]
                .map(row => row.map(cell => {
                    const s = String(cell);
                    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
                    return s;
                }).join(',')).join('\n');

            const bom = '\uFEFF';
            const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
            const now = new Date();
            const ts = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + '_' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
            const filename = `統合台帳検索結果_${ts}.csv`;

            const link = document.createElement('a');
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                tr.showToast(`${tr.currentSearchResults.length}件のデータをエクスポートしました`, 'success');
            } else {
                throw new Error('お使いのブラウザはファイルダウンロードをサポートしていません。');
            }
        } catch (error) {
            // minimal logging
            this.tableRenderer.showToast('エクスポートに失敗しました', 'error');
            alert(`エクスポート中にエラーが発生しました。\n詳細: ${error.message}`);
        } finally {
            const exportButton = document.querySelector('.export-data-button');
            if (exportButton) {
                exportButton.disabled = false;
                exportButton.textContent = 'CSV出力';
            }
        }
    }

    // 履歴管理アプリに台帳別に投入
    async uploadHistoryToApp(appId = null) {
        const tr = this.tableRenderer;
        try {
            if (appId) {
                const ledgerHistoryMap = tr.updateHistoryMap.get(appId);
                if (!ledgerHistoryMap || ledgerHistoryMap.size === 0) {
                    // no data
                    return;
                }
                const ledgerHistoryData = [];
                for (const [, historyData] of ledgerHistoryMap) ledgerHistoryData.push(historyData);
                if (ledgerHistoryData.length === 0) {
                    // no data
                    return;
                }
                const records = ledgerHistoryData.map(historyData => {
                    const record = {
                        [CONFIG.historyApp.fields.batchId]: { value: historyData.batchId },
                        [CONFIG.historyApp.fields.recordId]: { value: historyData.recordId },
                        [CONFIG.historyApp.fields.appId]: { value: historyData.appId },
                        [CONFIG.historyApp.fields.ledgerName]: { value: historyData.ledgerName },
                        [CONFIG.historyApp.fields.primaryKey]: { value: historyData.primaryKey || '' },
                        [CONFIG.historyApp.fields.result]: { value: historyData.updateResult }
                    };
                    if (historyData.changeContent) record[CONFIG.historyApp.fields.changeContent] = { value: historyData.changeContent };
                    if (historyData.integrationKeyAfter) record[CONFIG.historyApp.fields.integrationKeyAfter] = { value: historyData.integrationKeyAfter };
                    if (historyData.integrationKeyBefore) record[CONFIG.historyApp.fields.integrationKeyBefore] = { value: historyData.integrationKeyBefore };
                    // 新レイアウト向け: 統合キー→主キー3種 + 「その他」3種（可能ならTableRenderer側の直接値を優先）
                    try {
                        const di = window.dataIntegrator || new DataIntegrator();
                        const parsedBefore = historyData.integrationKeyBefore ? di.parseIntegrationKey(historyData.integrationKeyBefore) : { PC: '', EXT: '', SEAT: '' };
                        const parsedAfter = historyData.integrationKeyAfter ? di.parseIntegrationKey(historyData.integrationKeyAfter) : { PC: '', EXT: '', SEAT: '' };
                        const bPC = historyData.beforePCNumber || parsedBefore.PC || '';
                        const bEX = historyData.beforeExtNumber || parsedBefore.EXT || '';
                        const bSE = historyData.beforeSeatNumber || parsedBefore.SEAT || '';
                        const aPC = historyData.afterPCNumber || parsedAfter.PC || '';
                        const aEX = historyData.afterExtNumber || parsedAfter.EXT || '';
                        const aSE = historyData.afterSeatNumber || parsedAfter.SEAT || '';
                        if (CONFIG.historyApp.fields.beforePCNumber) record[CONFIG.historyApp.fields.beforePCNumber] = { value: bPC };
                        if (CONFIG.historyApp.fields.beforeExtNumber) record[CONFIG.historyApp.fields.beforeExtNumber] = { value: bEX };
                        if (CONFIG.historyApp.fields.beforeSeatNumber) record[CONFIG.historyApp.fields.beforeSeatNumber] = { value: bSE };
                        if (CONFIG.historyApp.fields.afterPCNumber) record[CONFIG.historyApp.fields.afterPCNumber] = { value: aPC };
                        if (CONFIG.historyApp.fields.afterExtNumber) record[CONFIG.historyApp.fields.afterExtNumber] = { value: aEX };
                        if (CONFIG.historyApp.fields.afterSeatNumber) record[CONFIG.historyApp.fields.afterSeatNumber] = { value: aSE };

                        // changeContent から各台帳「その他」を抽出
                        const changeText = historyData.changeContent || '';
                        const fieldToLedger = new Map();
                        try {
                            CONFIG.integratedTableConfig.columns.forEach(col => { if (col && col.fieldCode) fieldToLedger.set(col.fieldCode, col.ledger); });
                        } catch (ee) { /* noop */ }
                        const push = (arr, code, val) => { if (val && val !== '(空)') arr.push(`${code}:${val}`); };
                        const before = { pc: [], ext: [], seat: [] };
                        const after  = { pc: [], ext: [], seat: [] };
                        changeText.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(line => {
                            const m = line.match(/^【(.+?)】(.*?)→(.*)$/);
                            if (!m) return;
                            const fieldCode = m[1];
                            if (fieldCode === 'PC番号' || fieldCode === '内線番号' || fieldCode === '座席番号') return;
                            const beforeVal = (m[2] || '').replace(/^\s*[:：]?\s*/, '').trim();
                            const afterVal  = (m[3] || '').replace(/^\s*[:：]?\s*/, '').trim();
                            const ledger = fieldToLedger.get(fieldCode) || '';
                            if (ledger === 'PC台帳') { push(before.pc, fieldCode, beforeVal); push(after.pc, fieldCode, afterVal); }
                            else if (ledger === '内線台帳') { push(before.ext, fieldCode, beforeVal); push(after.ext, fieldCode, afterVal); }
                            else if (ledger === '座席台帳') { push(before.seat, fieldCode, beforeVal); push(after.seat, fieldCode, afterVal); }
                        });
                        if (CONFIG.historyApp.fields.beforePCOthers)   record[CONFIG.historyApp.fields.beforePCOthers]   = { value: before.pc.join(',') };
                        if (CONFIG.historyApp.fields.beforeExtOthers)  record[CONFIG.historyApp.fields.beforeExtOthers]  = { value: before.ext.join(',') };
                        if (CONFIG.historyApp.fields.beforeSeatOthers) record[CONFIG.historyApp.fields.beforeSeatOthers] = { value: before.seat.join(',') };
                        if (CONFIG.historyApp.fields.afterPCOthers)    record[CONFIG.historyApp.fields.afterPCOthers]    = { value: after.pc.join(',') };
                        if (CONFIG.historyApp.fields.afterExtOthers)   record[CONFIG.historyApp.fields.afterExtOthers]   = { value: after.ext.join(',') };
                        if (CONFIG.historyApp.fields.afterSeatOthers)  record[CONFIG.historyApp.fields.afterSeatOthers]  = { value: after.seat.join(',') };
                    } catch (e) { /* noop */ }
                    if (historyData.request) record[CONFIG.historyApp.fields.request] = { value: JSON.stringify(historyData.request) };
                    if (historyData.response) record[CONFIG.historyApp.fields.response] = { value: JSON.stringify(historyData.response) };
                    if (historyData.error) record[CONFIG.historyApp.fields.error] = { value: JSON.stringify(historyData.error) };
                    return record;
                });
                const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'POST', { app: CONFIG.historyApp.appId, records });
                // uploaded
                tr.updateHistoryMap.delete(appId);
                // タブ側に直近アップロード分を反映
                this.renderHistoryPreview(ledgerHistoryData);
            } else {
                if (tr.updateHistoryMap.size === 0) {
                    // no data
                    return;
                }
                const allHistoryData = [];
                for (const [, ledgerHistoryMap] of tr.updateHistoryMap) {
                    for (const [, historyData] of ledgerHistoryMap) allHistoryData.push(historyData);
                }
                if (allHistoryData.length === 0) {
                    // no data
                    return;
                }
                const records = allHistoryData.map(historyData => {
                    const record = {
                        [CONFIG.historyApp.fields.batchId]: { value: historyData.batchId },
                        [CONFIG.historyApp.fields.recordId]: { value: historyData.recordId },
                        [CONFIG.historyApp.fields.appId]: { value: historyData.appId },
                        [CONFIG.historyApp.fields.ledgerName]: { value: historyData.ledgerName },
                        [CONFIG.historyApp.fields.primaryKey]: { value: historyData.primaryKey || '' },
                        [CONFIG.historyApp.fields.result]: { value: historyData.updateResult }
                    };
                    if (historyData.changeContent) record[CONFIG.historyApp.fields.changeContent] = { value: historyData.changeContent };
                    if (historyData.integrationKeyAfter) record[CONFIG.historyApp.fields.integrationKeyAfter] = { value: historyData.integrationKeyAfter };
                    if (historyData.integrationKeyBefore) record[CONFIG.historyApp.fields.integrationKeyBefore] = { value: historyData.integrationKeyBefore };
                    // 新レイアウト向け: 統合キー→主キー3種 + 「その他」3種
                    try {
                        const di = window.dataIntegrator || new DataIntegrator();
                        const parsedBefore = historyData.integrationKeyBefore ? di.parseIntegrationKey(historyData.integrationKeyBefore) : { PC: '', EXT: '', SEAT: '' };
                        const parsedAfter = historyData.integrationKeyAfter ? di.parseIntegrationKey(historyData.integrationKeyAfter) : { PC: '', EXT: '', SEAT: '' };
                        if (CONFIG.historyApp.fields.beforePCNumber) record[CONFIG.historyApp.fields.beforePCNumber] = { value: parsedBefore.PC || '' };
                        if (CONFIG.historyApp.fields.beforeExtNumber) record[CONFIG.historyApp.fields.beforeExtNumber] = { value: parsedBefore.EXT || '' };
                        if (CONFIG.historyApp.fields.beforeSeatNumber) record[CONFIG.historyApp.fields.beforeSeatNumber] = { value: parsedBefore.SEAT || '' };
                        if (CONFIG.historyApp.fields.afterPCNumber) record[CONFIG.historyApp.fields.afterPCNumber] = { value: parsedAfter.PC || '' };
                        if (CONFIG.historyApp.fields.afterExtNumber) record[CONFIG.historyApp.fields.afterExtNumber] = { value: parsedAfter.EXT || '' };
                        if (CONFIG.historyApp.fields.afterSeatNumber) record[CONFIG.historyApp.fields.afterSeatNumber] = { value: parsedAfter.SEAT || '' };

                        const changeText = historyData.changeContent || '';
                        const fieldToLedger = new Map();
                        try { CONFIG.integratedTableConfig.columns.forEach(col => { if (col && col.fieldCode) fieldToLedger.set(col.fieldCode, col.ledger); }); } catch (ee) { /* noop */ }
                        const push = (arr, code, val) => { if (val && val !== '(空)') arr.push(`${code}:${val}`); };
                        const before = { pc: [], ext: [], seat: [] };
                        const after  = { pc: [], ext: [], seat: [] };
                        changeText.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(line => {
                            const m = line.match(/^【(.+?)】(.*?)→(.*)$/);
                            if (!m) return;
                            const fieldCode = m[1];
                            if (fieldCode === 'PC番号' || fieldCode === '内線番号' || fieldCode === '座席番号') return;
                            const beforeVal = (m[2] || '').replace(/^\s*[:：]?\s*/, '').trim();
                            const afterVal  = (m[3] || '').replace(/^\s*[:：]?\s*/, '').trim();
                            const ledger = fieldToLedger.get(fieldCode) || '';
                            if (ledger === 'PC台帳') { push(before.pc, fieldCode, beforeVal); push(after.pc, fieldCode, afterVal); }
                            else if (ledger === '内線台帳') { push(before.ext, fieldCode, beforeVal); push(after.ext, fieldCode, afterVal); }
                            else if (ledger === '座席台帳') { push(before.seat, fieldCode, beforeVal); push(after.seat, fieldCode, afterVal); }
                        });
                        if (CONFIG.historyApp.fields.beforePCOthers)   record[CONFIG.historyApp.fields.beforePCOthers]   = { value: before.pc.join(',') };
                        if (CONFIG.historyApp.fields.beforeExtOthers)  record[CONFIG.historyApp.fields.beforeExtOthers]  = { value: before.ext.join(',') };
                        if (CONFIG.historyApp.fields.beforeSeatOthers) record[CONFIG.historyApp.fields.beforeSeatOthers] = { value: before.seat.join(',') };
                        if (CONFIG.historyApp.fields.afterPCOthers)    record[CONFIG.historyApp.fields.afterPCOthers]    = { value: after.pc.join(',') };
                        if (CONFIG.historyApp.fields.afterExtOthers)   record[CONFIG.historyApp.fields.afterExtOthers]   = { value: after.ext.join(',') };
                        if (CONFIG.historyApp.fields.afterSeatOthers)  record[CONFIG.historyApp.fields.afterSeatOthers]  = { value: after.seat.join(',') };
                    } catch (e) { /* noop */ }
                    if (historyData.request) record[CONFIG.historyApp.fields.request] = { value: JSON.stringify(historyData.request) };
                    if (historyData.response) record[CONFIG.historyApp.fields.response] = { value: JSON.stringify(historyData.response) };
                    if (historyData.error) record[CONFIG.historyApp.fields.error] = { value: JSON.stringify(historyData.error) };
                    return record;
                });
                const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'POST', { app: CONFIG.historyApp.appId, records });
                // uploaded
                tr.updateHistoryMap.clear();
                // タブ側に直近アップロード分を反映
                this.renderHistoryPreview(allHistoryData);
            }
        } catch (error) {
            // minimal logging
        }
    }

    // 更新履歴タブに簡易表示
    renderHistoryPreview(historyDataArray) {
        try {
            const container = document.querySelector(this.historyContainerSelector);
            if (!container) return;
            // 最新から最大100件まで
            const items = historyDataArray.slice(-100).reverse();
            const table = document.createElement('table');
            table.className = 'history-table';
            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th>台帳名</th><th>レコードID</th><th>結果</th><th>更新内容</th><th>バッチID</th><th>時刻</th></tr>';
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            items.forEach(h => {
                const tr = document.createElement('tr');
                const tdLedger = document.createElement('td'); tdLedger.textContent = h.ledgerName || '';
                const tdId = document.createElement('td'); tdId.textContent = h.recordId || '';
                const tdResult = document.createElement('td'); tdResult.textContent = h.updateResult || '';
                const tdChange = document.createElement('td'); tdChange.textContent = h.changeContent || '';
                const tdBatch = document.createElement('td'); tdBatch.textContent = h.batchId || '';
                const tdTs = document.createElement('td'); tdTs.textContent = h.timestamp || '';
                tr.appendChild(tdLedger);
                tr.appendChild(tdId);
                tr.appendChild(tdResult);
                tr.appendChild(tdChange);
                tr.appendChild(tdBatch);
                tr.appendChild(tdTs);
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            container.innerHTML = '';
            container.appendChild(table);
        } catch (e) { /* noop */ }
    }
}

// グローバルに公開
window.ExportAndHistory = ExportAndHistory;


