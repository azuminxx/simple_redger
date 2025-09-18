/**
 * 貸出管理タブ UI/ロジック
 */
class LendingManager {
    constructor() {
        this.userListAPI = new UserListAPI();
        this.container = null;
        this.searchInput = null;
        this.searchButton = null;
        this.messageArea = null;
        this.tableArea = null;
        this.controlsArea = null;

        this.currentRecord = null; // 取得したKintoneレコード（$id, $revision, 貸出管理 など）
        this.currentRows = [];     // 画面編集中の行モデル { id, 貸出日, 品名, 型番, 返却日, 備考, 貸出状況, 最終更新者 }
    }

    /**
     * タブ用のコンテナを生成
     */
    buildTabContent() {
        this.container = DOMHelper.createElement('div', {}, 'lending-tab-container');

        const header = DOMHelper.createElement('div', {}, 'lending-header');
        const title = DOMHelper.createElement('h4');
        title.textContent = '貸出管理';
        header.appendChild(title);
        this.container.appendChild(header);

        // 検索エリア
        const searchArea = DOMHelper.createElement('div', {}, 'lending-search-area');
        const label = DOMHelper.createElement('label');
        label.textContent = 'BSSID';
        label.setAttribute('for', 'lending-bssid-input');
        this.searchInput = DOMHelper.createElement('input', { type: 'text', id: 'lending-bssid-input', placeholder: 'BSSID を入力', autocomplete: 'off' }, 'lending-bssid-input');
        this.searchButton = DOMHelper.createElement('button', {}, 'lending-search-button');
        this.searchButton.textContent = '検索';
        this.searchButton.addEventListener('click', () => this.handleSearch());
        this.searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.handleSearch(); });
        searchArea.appendChild(label);
        searchArea.appendChild(this.searchInput);
        searchArea.appendChild(this.searchButton);
        this.container.appendChild(searchArea);

        // メッセージ表示エリア
        this.messageArea = DOMHelper.createElement('div', {}, 'lending-message-area');
        this.container.appendChild(this.messageArea);

        // テーブルエリア
        this.tableArea = DOMHelper.createElement('div', {}, 'lending-table-area');
        this.container.appendChild(this.tableArea);

        // 操作エリア
        this.controlsArea = DOMHelper.createElement('div', {}, 'lending-controls-area');
        const addRowBtn = DOMHelper.createElement('button', {}, 'lending-add-row');
        addRowBtn.textContent = '貸出行を追加';
        addRowBtn.addEventListener('click', () => this.addEmptyRow());

        const updateBtn = DOMHelper.createElement('button', {}, 'lending-update');
        updateBtn.textContent = '更新';
        updateBtn.addEventListener('click', () => this.handleUpdate());

        const resetLink = DOMHelper.createElement('button', {}, 'lending-reset');
        resetLink.textContent = 'リセット';
        resetLink.addEventListener('click', () => this.reloadFromServer());

        this.controlsArea.appendChild(addRowBtn);
        this.controlsArea.appendChild(updateBtn);
        this.controlsArea.appendChild(resetLink);
        this.container.appendChild(this.controlsArea);

        return this.container;
    }

    /**
     * 検索実行
     */
    async handleSearch() {
        const bssid = (this.searchInput?.value || '').trim();
        if (!bssid) {
            this.showMessage('BSSIDを入力してください。');
            return;
        }
        this.setLoading(true);
        try {
            const record = await this.userListAPI.searchUserById(bssid);
            if (!record) {
                this.currentRecord = null;
                this.currentRows = [];
                this.renderTable();
                this.showMessage('該当ユーザーが見つかりません');
                return;
            }
            this.currentRecord = record;
            this.currentRows = this.extractRowsFromRecord(record);
            this.renderTable();
            this.showMessage('');
        } catch (e) {
            console.error('貸出管理 検索エラー:', e);
            this.showMessage('検索中にエラーが発生しました');
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * レコードからサブテーブル行を抽出してUIモデル配列を返す
     */
    extractRowsFromRecord(record) {
        const sub = record['貸出管理'];
        const values = (sub && Array.isArray(sub.value)) ? sub.value : [];
        return values.map(row => {
            const v = row.value || {};
            return {
                id: row.id || null,
                '貸出日': v['貸出日']?.value || '',
                '品名': v['品名']?.value || '',
                '型番': v['型番']?.value || '',
                '貸出状況': v['貸出状況']?.value || '', // 表示のみ
                '返却日': v['返却日']?.value || '',
                '備考': v['備考']?.value || '',
                '最終更新者': v['最終更新者']?.value || '' // 表示のみ
            };
        });
    }

    /**
     * テーブル描画
     */
    renderTable() {
        // 初期化
        this.tableArea.innerHTML = '';

        const table = document.createElement('table');
        table.className = 'lending-table';

        const thead = document.createElement('thead');
        thead.innerHTML = '<tr class="lending-header-row">' +
            '<th class="lending-th">貸出日<span class="req">*</span></th>' +
            '<th class="lending-th">品名<span class="req">*</span></th>' +
            '<th class="lending-th">型番</th>' +
            '<th class="lending-th">貸出状況</th>' +
            '<th class="lending-th">返却日</th>' +
            '<th class="lending-th lending-note-col">備考</th>' +
            '<th class="lending-th">最終更新者</th>' +
        '</tr>';
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        this.currentRows.forEach((row, index) => {
            tbody.appendChild(this.createRowElement(row, index));
        });
        table.appendChild(tbody);

        this.tableArea.appendChild(table);
    }

    /**
     * 行のDOMを生成
     */
    createRowElement(row, index) {
        const tr = document.createElement('tr');
        tr.setAttribute('data-row-index', String(index));

        // 貸出日 (必須)
        const tdLoanDate = document.createElement('td');
        const inputLoanDate = DOMHelper.createElement('input', { type: 'date' }, 'loan-date-input');
        inputLoanDate.value = row['貸出日'] || '';
        tdLoanDate.appendChild(inputLoanDate);
        tr.appendChild(tdLoanDate);

        // 品名 (必須)
        const tdItem = document.createElement('td');
        const selectItem = document.createElement('select');
        ['','モニター','USB変換'].forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt || '選択してください';
            if (opt === (row['品名'] || '')) o.selected = true;
            selectItem.appendChild(o);
        });
        tdItem.appendChild(selectItem);
        tr.appendChild(tdItem);

        // 型番
        const tdModel = document.createElement('td');
        const inputModel = DOMHelper.createElement('input', { type: 'text' }, 'model-input');
        inputModel.value = row['型番'] || '';
        tdModel.appendChild(inputModel);
        tr.appendChild(tdModel);

        // 貸出状況（表示のみ）
        const tdStatus = document.createElement('td');
        tdStatus.textContent = row['貸出状況'] || '';
        tdStatus.className = 'readonly-cell';
        tr.appendChild(tdStatus);

        // 返却日
        const tdReturnDate = document.createElement('td');
        const inputReturnDate = DOMHelper.createElement('input', { type: 'date' }, 'return-date-input');
        inputReturnDate.value = row['返却日'] || '';
        tdReturnDate.appendChild(inputReturnDate);
        tr.appendChild(tdReturnDate);

        // 備考
        const tdNote = document.createElement('td');
        tdNote.className = 'note-cell';
        const inputNote = DOMHelper.createElement('input', { type: 'text' }, 'note-input');
        inputNote.value = row['備考'] || '';
        tdNote.appendChild(inputNote);
        tr.appendChild(tdNote);

        // 最終更新者（表示のみ）
        const tdUpdater = document.createElement('td');
        tdUpdater.textContent = row['最終更新者'] || '';
        tdUpdater.className = 'readonly-cell';
        tr.appendChild(tdUpdater);

        return tr;
    }

    /**
     * 空行を追加（初期値: 貸出日=本日、他空）
     */
    addEmptyRow() {
        if (!this.currentRecord) {
            this.showMessage('先にBSSIDで検索してください');
            return;
        }

        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        const loginName = (kintone.getLoginUser && kintone.getLoginUser().name) ? kintone.getLoginUser().name : '';

        const newRow = {
            id: null,
            '貸出日': todayStr,
            '品名': '',
            '型番': '',
            '貸出状況': '',
            '返却日': '',
            '備考': '',
            '最終更新者': loginName
        };
        this.currentRows.push(newRow);
        this.renderTable();
    }

    /**
     * 現在のテーブルDOMから値を収集し、モデルを更新
     */
    collectValuesFromTable() {
        const tbody = this.tableArea.querySelector('tbody');
        if (!tbody) return;
        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.forEach(tr => {
            const idx = parseInt(tr.getAttribute('data-row-index'));
            const inputs = tr.querySelectorAll('input, select');
            const loanDate = inputs[0]?.value || '';
            const item = inputs[1]?.value || '';
            const model = inputs[2]?.value || '';
            const returnDate = inputs[3]?.value || '';
            const note = inputs[4]?.value || '';

            const loginName = (kintone.getLoginUser && kintone.getLoginUser().name) ? kintone.getLoginUser().name : '';

            const orig = this.currentRows[idx] || {};
            this.currentRows[idx] = {
                id: orig.id || null,
                '貸出日': loanDate,
                '品名': item,
                '型番': model,
                '貸出状況': orig['貸出状況'] || '',
                '返却日': returnDate,
                '備考': note,
                '最終更新者': loginName // 表示のみだが更新時に送信
            };
        });
    }

    /**
     * バリデーション
     */
    validate() {
        const errors = [];
        this.currentRows.forEach((row, idx) => {
            if (!row['貸出日']) errors.push(`行${idx + 1}: 貸出日は必須です`);
            if (!row['品名']) errors.push(`行${idx + 1}: 品名は必須です`);
            if (row['返却日'] && row['貸出日'] && row['返却日'] < row['貸出日']) {
                errors.push(`行${idx + 1}: 返却日は貸出日以降を指定してください`);
            }
        });
        return errors;
    }

    /**
     * 更新処理
     */
    async handleUpdate() {
        if (!this.currentRecord) {
            this.showMessage('先にBSSIDで検索してください');
            return;
        }

        // DOM→モデル反映
        this.collectValuesFromTable();

        // バリデーション
        const errors = this.validate();
        if (errors.length > 0) {
            alert(errors.join('\n'));
            return;
        }

        // 送信ペイロード作成（サブテーブル全体を送る）
        const rowsPayload = this.currentRows.map(row => {
            const value = {
                '貸出日': { value: row['貸出日'] || '' },
                '品名': { value: row['品名'] || '' },
                '型番': { value: row['型番'] || '' },
                '返却日': { value: row['返却日'] || '' },
                '備考': { value: row['備考'] || '' },
                '最終更新者': { value: row['最終更新者'] || '' }
            };
            if (row.id) {
                return { id: row.id, value };
            }
            return { value };
        });

        // レコードID・revision
        const recordId = this.currentRecord.$id?.value || this.currentRecord['レコード番号']?.value;
        const revision = this.currentRecord.$revision?.value || this.currentRecord['$revision']?.value;
        if (!recordId) {
            alert('レコードIDが取得できませんでした。');
            return;
        }

        this.setLoading(true);
        try {
            await this.userListAPI.updateLendingSubtable(parseInt(recordId), revision ? parseInt(revision) : undefined, rowsPayload);
            // 成功後、最新データを再取得
            const bssid = this.currentRecord?.BSSID?.value || '';
            const fresh = bssid ? await this.userListAPI.searchUserById(bssid) : null;
            if (fresh) {
                this.currentRecord = fresh;
                this.currentRows = this.extractRowsFromRecord(fresh);
                this.renderTable();
            }
            alert('更新しました');
        } catch (e) {
            console.error('貸出管理 更新エラー:', e);
            if (e?.code === 'GAIA_RECMODIFIED' || /revision/i.test(e?.message || '')) {
                alert('他のユーザーにより更新されました。再読み込みしてから再度お試しください。');
            } else {
                alert('更新に失敗しました。権限やネットワークを確認してください。');
            }
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * サーバーから再読み込み
     */
    async reloadFromServer() {
        if (!this.currentRecord) return;
        const bssid = this.currentRecord?.BSSID?.value || '';
        if (!bssid) return;
        this.setLoading(true);
        try {
            const record = await this.userListAPI.searchUserById(bssid);
            this.currentRecord = record;
            this.currentRows = this.extractRowsFromRecord(record || {});
            this.renderTable();
            this.showMessage('');
        } catch (e) {
            console.error('貸出管理 再読込エラー:', e);
            this.showMessage('再読込に失敗しました');
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * メッセージ表示
     */
    showMessage(msg) {
        if (this.messageArea) {
            this.messageArea.textContent = msg || '';
        }
    }

    /**
     * ローディング状態
     */
    setLoading(loading) {
        if (loading) {
            this.container?.classList.add('loading');
            if (this.searchButton) this.searchButton.disabled = true;
        } else {
            this.container?.classList.remove('loading');
            if (this.searchButton) this.searchButton.disabled = false;
        }
    }
}

// グローバルに公開
window.LendingManager = LendingManager;


