/* =============================================================================
   更新履歴管理システム - メインJavaScript
   ============================================================================= */

(function() {
    'use strict';

    // =============================================================================
    // 🌐 グローバル変数
    // =============================================================================

    let historyData = [];
    let filteredData = [];
    let selectedRecords = new Set();
    let currentPage = 1;
    let itemsPerPage = 20;
    let sortColumn = 'update_date';
    let sortDirection = 'desc';
    let currentUser = 'システム管理者'; // 実際の実装では kintone.getLoginUser() を使用
    let isGroupedByBatch = false; // バッチ別表示フラグ
    let groupedData = {}; // バッチ別グループ化データ

    // DOM要素の参照を保持
    const elements = {};

    // =============================================================================
    // 🚀 システム初期化
    // =============================================================================

    /**
     * システム初期化
     */
    function initHistorySystem() {
        console.log('📋 更新履歴管理システム初期化開始');
        
        // 履歴管理システムのページかどうかを判定
        if (!isHistoryPage()) {
            console.log('ℹ️ 履歴管理システムページではないため、初期化をスキップします');
            return;
        }
        
        try {
            // bodyタグに履歴システム識別属性を追加
            document.body.setAttribute('data-page', 'history');
            document.body.classList.add('history-system-page');
            
            initDOMElements();
            setupEventListeners();
            initializeFilters();
            loadHistoryData();
        } catch (error) {
            console.error('❌ 更新履歴管理システム初期化エラー:', error);
            return;
        }
        
        console.log('✅ 更新履歴管理システム初期化完了');
    }

    /**
     * 履歴管理システムのページかどうかを判定
     */
    function isHistoryPage() {
        return document.getElementById('history-table') !== null ||
               document.querySelector('.stats-panel') !== null ||
               document.title.includes('更新履歴管理システム');
    }

    /**
     * DOM要素を取得
     */
    function initDOMElements() {
        // 必須要素の存在チェック
        const requiredElements = ['history-table', 'history-table-body', 'stats-panel'];
        for (const elementId of requiredElements) {
            if (!document.getElementById(elementId) && !document.querySelector(`.${elementId}`)) {
                throw new Error(`必須要素が見つかりません: ${elementId}`);
            }
        }
        
        elements.refreshBtn = document.getElementById('refresh-btn');
        elements.exportBtn = document.getElementById('export-btn');
        elements.backToMainBtn = document.getElementById('back-to-main-btn');
        
        // 統計要素
        elements.totalUpdates = document.getElementById('total-updates');
        elements.pendingApplications = document.getElementById('pending-applications');
        elements.completedApplications = document.getElementById('completed-applications');
        elements.overdueApplications = document.getElementById('overdue-applications');
        
        // フィルタ要素
        elements.viewScopeRadios = document.querySelectorAll('input[name="view-scope"]');
        elements.dateFrom = document.getElementById('date-from');
        elements.dateTo = document.getElementById('date-to');
        elements.ledgerFilter = document.getElementById('ledger-filter');
        elements.applicationStatusFilter = document.getElementById('application-status-filter');
    }

    /**
     * イベントリスナーを設定
     */
    function setupEventListeners() {
        // ヘッダーボタン
        elements.refreshBtn.addEventListener('click', handleRefresh);
        elements.exportBtn.addEventListener('click', handleExport);
        elements.backToMainBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        // バッチ別表示ボタン
        elements.groupByBatchBtn = document.getElementById('group-by-batch-btn');
        elements.groupByBatchBtn.addEventListener('click', toggleBatchGrouping);

        // テーブルアクション
        elements.bulkApplicationBtn = document.getElementById('bulk-application-btn');
        elements.markCompletedBtn = document.getElementById('mark-completed-btn');
        elements.bulkApplicationBtn.addEventListener('click', handleBulkApplication);
        elements.markCompletedBtn.addEventListener('click', handleMarkCompleted);

        // フィルタ
        elements.viewScopeRadios.forEach(radio => {
            radio.addEventListener('change', handleViewScopeChange);
        });

        elements.dateFrom.addEventListener('change', applyFilters);
        elements.dateTo.addEventListener('change', applyFilters);
        elements.ledgerFilter.addEventListener('change', applyFilters);
        elements.applicationStatusFilter.addEventListener('change', applyFilters);

        // 検索
        elements.searchInput = document.getElementById('search-input');
        elements.searchBtn = document.getElementById('search-btn');
        elements.clearFiltersBtn = document.getElementById('clear-filters-btn');

        elements.searchInput.addEventListener('input', debounce(applyFilters, 300));
        elements.searchBtn.addEventListener('click', applyFilters);
        elements.clearFiltersBtn.addEventListener('click', clearFilters);

        // テーブルソート
        document.querySelectorAll('.sortable').forEach(header => {
            header.addEventListener('click', handleSort);
        });

        // 全選択チェックボックス
        if (elements.selectAllCheckbox) {
            elements.selectAllCheckbox.addEventListener('change', handleSelectAll);
        }

        // キーボードショートカット
        document.addEventListener('keydown', handleKeyDown);

        // ページネーション（動的に追加されるため、イベント委譲を使用）
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('page-btn')) {
                const page = parseInt(e.target.dataset.page);
                changePage(page);
            }
        });

        // 行選択（イベント委譲）
        if (elements.historyTableBody) {
            elements.historyTableBody.addEventListener('change', (e) => {
                if (e.target.classList.contains('row-checkbox')) {
                    const row = e.target.closest('tr');
                    const recordId = row.dataset.recordId;
                    handleRowSelect(e, recordId);
                }
            });

            // 詳細表示（イベント委譲）
            elements.historyTableBody.addEventListener('click', (e) => {
                if (e.target.classList.contains('detail-btn')) {
                    const recordId = e.target.dataset.recordId;
                    const record = filteredData.find(r => r.id === recordId);
                    if (record) {
                        showDetailModal(record);
                    }
                }
                
                // 申請登録ボタン
                if (e.target.classList.contains('application-btn')) {
                    const recordId = e.target.dataset.recordId;
                    const record = filteredData.find(r => r.id === recordId);
                    if (record) {
                        showApplicationModal(record);
                    }
                }
            });
        }

        // モーダル関連のイベントリスナー
        if (elements.applicationModalClose) {
            elements.applicationModalClose.addEventListener('click', closeApplicationModal);
        }
        if (elements.applicationCancelBtn) {
            elements.applicationCancelBtn.addEventListener('click', closeApplicationModal);
        }
        if (elements.applicationSaveBtn) {
            elements.applicationSaveBtn.addEventListener('click', saveApplicationInfo);
        }
        if (elements.detailModalClose) {
            elements.detailModalClose.addEventListener('click', closeDetailModal);
        }
        if (elements.detailCloseBtn) {
            elements.detailCloseBtn.addEventListener('click', closeDetailModal);
        }

        // モーダル背景クリックで閉じる
        if (elements.applicationModal) {
            elements.applicationModal.addEventListener('click', (e) => {
                if (e.target === elements.applicationModal) {
                    closeApplicationModal();
                }
            });
        }
        if (elements.detailModal) {
            elements.detailModal.addEventListener('click', (e) => {
                if (e.target === elements.detailModal) {
                    closeDetailModal();
                }
            });
        }
    }

    /**
     * フィルタを初期化
     */
    function initializeFilters() {
        // 今日の日付を設定
        const today = new Date();
        const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
        
        elements.dateFrom.value = oneMonthAgo.toISOString().split('T')[0];
        elements.dateTo.value = today.toISOString().split('T')[0];
        
        // 現在のユーザー情報を取得
        currentUser = kintone.getLoginUser().name || 'Unknown User';
    }

    // =============================================================================
    // 📊 データ管理
    // =============================================================================

    /**
     * 履歴データを読み込み
     */
    async function loadHistoryData() {
        showLoading(true);
        
        try {
            historyData = await fetchHistoryData();
            applyFilters();
            updateStatistics();
        } catch (error) {
            console.error('❌ 履歴データの読み込みに失敗:', error);
            showError('履歴データの読み込みに失敗しました。');
        } finally {
            showLoading(false);
        }
    }

    /**
     * 履歴データを取得（kintone API使用）
     */
    async function fetchHistoryData() {
        try {
            const historyAppId = window.LedgerV2.Config.APP_IDS.HISTORY;
            if (!historyAppId) {
                console.warn('⚠️ 更新履歴台帳のアプリIDが設定されていません');
                return [];
            }

            // 過去3ヶ月のデータを取得
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            const query = `更新日時 >= "${threeMonthsAgo.toISOString()}" order by 更新日時 desc`;

            const response = await kintone.api('/k/v1/records', 'GET', {
                app: historyAppId,
                query: query,
                totalCount: true
            });

            // kintoneレコードを履歴データ形式に変換
            return response.records.map(record => ({
                id: record.$id.value,
                update_date: record.更新日時?.value || record.$revision.value,
                updater: record.更新者?.value || 'システム',
                batch_id: record.バッチID?.value || '',
                ledger_type: record.台帳種別?.value || '',
                record_key: record.レコードキー?.value || '',
                changes: record.更新内容?.value || '',
                application_status: record.申請状況?.value || 'not_required',
                application_number: record.申請番号?.value || '',
                application_deadline: record.申請期限?.value || '',
                notes: record.備考?.value || ''
            }));

        } catch (error) {
            console.error('❌ 履歴データ取得エラー:', error);
            throw error;
        }
    }

    // =============================================================================
    // 🔍 フィルタリング・検索
    // =============================================================================

    /**
     * フィルタを適用
     */
    function applyFilters() {
        let filtered = [...historyData];
        
        // 表示範囲フィルタ
        const viewScope = document.querySelector('input[name="view-scope"]:checked')?.value || 'all';
        if (viewScope === 'my') {
            filtered = filtered.filter(record => record.updater === currentUser);
        } else if (viewScope === 'team') {
            filtered = filtered.filter(record => record.updater !== currentUser);
        }
        
        // 日付範囲フィルタ
        const dateFrom = elements.dateFrom?.value;
        const dateTo = elements.dateTo?.value;
        
        if (dateFrom) {
            filtered = filtered.filter(record => 
                new Date(record.update_date) >= new Date(dateFrom)
            );
        }
        
        if (dateTo) {
            const endDate = new Date(dateTo);
            endDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter(record => 
                new Date(record.update_date) <= endDate
            );
        }
        
        // 台帳種別フィルタ
        const ledgerType = elements.ledgerFilter?.value;
        if (ledgerType) {
            filtered = filtered.filter(record => record.ledger_type === ledgerType);
        }
        
        // 申請状況フィルタ
        const applicationStatus = elements.applicationStatusFilter?.value;
        if (applicationStatus) {
            filtered = filtered.filter(record => record.application_status === applicationStatus);
        }
        
        // 検索フィルタ
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            const searchTerm = searchInput.value.toLowerCase().trim();
            if (searchTerm) {
                filtered = filtered.filter(record => {
                    const changesText = Array.isArray(record.changes) 
                        ? record.changes.map(c => `${c.field} ${c.old} ${c.new}`).join(' ')
                        : String(record.changes || '');
                    
                    return (
                        record.record_key.toLowerCase().includes(searchTerm) ||
                        record.application_number.toLowerCase().includes(searchTerm) ||
                        changesText.toLowerCase().includes(searchTerm) ||
                        record.notes.toLowerCase().includes(searchTerm)
                    );
                });
            }
        }
        
        filteredData = filtered;
        currentPage = 1;
        selectedRecords.clear();
        
        sortData();
        renderTable();
        updatePagination();
        updateStatistics();
        updateActionButtons();
    }

    /**
     * フィルタをクリア
     */
    function clearFilters() {
        if (elements.dateFrom) elements.dateFrom.value = '';
        if (elements.dateTo) elements.dateTo.value = '';
        if (elements.ledgerFilter) elements.ledgerFilter.value = '';
        if (elements.applicationStatusFilter) elements.applicationStatusFilter.value = '';
        
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.value = '';
        }
        
        const allRadio = document.querySelector('input[name="view-scope"][value="all"]');
        if (allRadio) {
            allRadio.checked = true;
        }
        
        applyFilters();
    }

    /**
     * 表示範囲変更ハンドラ
     */
    function handleViewScopeChange() {
        applyFilters();
    }

    /**
     * データをソート
     */
    function sortData() {
        filteredData.sort((a, b) => {
            let aValue = a[sortColumn];
            let bValue = b[sortColumn];
            
            if (sortColumn === 'update_date') {
                aValue = new Date(aValue);
                bValue = new Date(bValue);
            }
            
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }
            
            let result = 0;
            if (aValue < bValue) result = -1;
            if (aValue > bValue) result = 1;
            
            return sortDirection === 'desc' ? -result : result;
        });
    }

    /**
     * テーブルを描画
     */
    function renderTable() {
        const historyTableBody = document.getElementById('history-table-body');
        if (!historyTableBody) return;

        if (isGroupedByBatch) {
            renderGroupedTable();
            return;
        }

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageData = filteredData.slice(startIndex, endIndex);
        
        historyTableBody.innerHTML = '';
        
        pageData.forEach(record => {
            const row = createTableRow(record);
            historyTableBody.appendChild(row);
        });
        
        updateSelectAllCheckbox();
    }

    /**
     * テーブル行を作成
     */
    function createTableRow(record) {
        const row = document.createElement('tr');
        row.dataset.recordId = record.id;
        
        if (selectedRecords.has(record.id)) {
            row.classList.add('selected');
        }
        
        const changesHtml = formatChanges(record.changes);
        const statusBadge = createStatusBadge(record.application_status);
        
        row.innerHTML = `
            <td class="checkbox-col">
                <input type="checkbox" class="row-checkbox" ${selectedRecords.has(record.id) ? 'checked' : ''}>
            </td>
            <td>${formatDateTime(record.update_date)}</td>
            <td>${record.updater}</td>
            <td>${record.batch_id || '-'}</td>
            <td>${getLedgerDisplayName(record.ledger_type)}</td>
            <td>${record.record_key}</td>
            <td>${changesHtml}</td>
            <td>${statusBadge}</td>
            <td>${record.application_number || '-'}</td>
            <td>${record.application_deadline ? formatDate(record.application_deadline) : '-'}</td>
            <td>
                <button class="operation-btn detail-btn" data-record-id="${record.id}">詳細</button>
                ${record.application_status !== 'not_required' && record.application_status !== 'completed' ? 
                    `<button class="operation-btn primary application-btn" data-record-id="${record.id}">申請登録</button>` : 
                    ''
                }
            </td>
        `;
        
        return row;
    }

    /**
     * 日時をフォーマット
     */
    function formatDateTime(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * 日付をフォーマット
     */
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ja-JP');
    }

    /**
     * 台帳表示名を取得
     */
    function getLedgerDisplayName(ledgerType) {
        const names = {
            'SEAT': '座席台帳',
            'PC': 'PC台帳',
            'EXT': '内線台帳',
            'USER': 'ユーザー台帳'
        };
        return names[ledgerType] || ledgerType;
    }

    /**
     * 変更内容をフォーマット
     */
    function formatChanges(changes) {
        if (!changes) return '-';
        
        if (typeof changes === 'string') {
            try {
                changes = JSON.parse(changes);
            } catch (e) {
                return changes;
            }
        }
        
        if (!Array.isArray(changes) || changes.length === 0) return '-';
        
        return changes.map(change => 
            `${change.field}: ${change.old} → ${change.new}`
        ).join('<br>');
    }

    /**
     * 申請状況バッジを作成
     */
    function createStatusBadge(status) {
        const statusInfo = {
            'not_required': { text: '申請不要', icon: '➖' },
            'pending': { text: '未申請', icon: '⏳' },
            'in_progress': { text: '申請中', icon: '🔄' },
            'completed': { text: '申請完了', icon: '✅' },
            'overdue': { text: '期限超過', icon: '⚠️' }
        };
        
        const info = statusInfo[status] || { text: '不明', icon: '❓' };
        return `<span class="status-badge ${status}">${info.icon} ${info.text}</span>`;
    }

    // =============================================================================
    // 📊 統計情報
    // =============================================================================

    /**
     * 統計情報を更新
     */
    function updateStatistics() {
        const stats = calculateStatistics();
        
        if (elements.totalUpdates) elements.totalUpdates.textContent = stats.total.toLocaleString();
        if (elements.pendingApplications) elements.pendingApplications.textContent = stats.pending.toLocaleString();
        if (elements.completedApplications) elements.completedApplications.textContent = stats.completed.toLocaleString();
        if (elements.overdueApplications) elements.overdueApplications.textContent = stats.overdue.toLocaleString();
    }

    /**
     * 統計情報を計算
     */
    function calculateStatistics() {
        const total = filteredData.length;
        const pending = filteredData.filter(r => r.application_status === 'pending').length;
        const completed = filteredData.filter(r => r.application_status === 'completed').length;
        const overdue = filteredData.filter(r => {
            if (r.application_status !== 'pending' && r.application_status !== 'in_progress') return false;
            if (!r.application_deadline) return false;
            return new Date(r.application_deadline) < new Date();
        }).length;
        
        return { total, pending, completed, overdue };
    }

    // =============================================================================
    // 🎯 イベントハンドラ
    // =============================================================================

    /**
     * データ更新ハンドラ
     */
    function handleRefresh() {
        loadHistoryData();
    }

    /**
     * データエクスポートハンドラ
     */
    function handleExport() {
        try {
            const csvData = generateCSV(filteredData);
            downloadCSV(csvData, `更新履歴_${new Date().toISOString().split('T')[0]}.csv`);
            showSuccess('データをエクスポートしました。');
        } catch (error) {
            console.error('❌ エクスポートエラー:', error);
            showError('エクスポートに失敗しました。');
        }
    }

    /**
     * ソートハンドラ
     */
    function handleSort(e) {
        const column = e.currentTarget.dataset.sort;
        
        if (sortColumn === column) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            sortColumn = column;
            sortDirection = 'desc';
        }
        
        // ソートアイコンを更新
        document.querySelectorAll('.sortable').forEach(header => {
            header.classList.remove('sorted');
            const icon = header.querySelector('.sort-icon');
            icon.textContent = '↕️';
        });
        
        e.currentTarget.classList.add('sorted');
        const icon = e.currentTarget.querySelector('.sort-icon');
        icon.textContent = sortDirection === 'asc' ? '↑' : '↓';
        
        sortData();
        renderTable();
    }

    /**
     * 行選択ハンドラ
     */
    function handleRowSelect(e, recordId) {
        const row = e.target.closest('tr');
        
        if (e.target.checked) {
            selectedRecords.add(recordId);
            row.classList.add('selected');
        } else {
            selectedRecords.delete(recordId);
            row.classList.remove('selected');
        }
        
        updateSelectAllCheckbox();
        updateActionButtons();
    }

    /**
     * 全選択ハンドラ
     */
    function handleSelectAll(e) {
        const checkboxes = document.querySelectorAll('.row-checkbox');
        const rows = document.querySelectorAll('#history-table-body tr');
        
        if (e.target.checked) {
            checkboxes.forEach((checkbox, index) => {
                checkbox.checked = true;
                const recordId = rows[index].dataset.recordId;
                selectedRecords.add(recordId);
                rows[index].classList.add('selected');
            });
        } else {
            checkboxes.forEach((checkbox, index) => {
                checkbox.checked = false;
                const recordId = rows[index].dataset.recordId;
                selectedRecords.delete(recordId);
                rows[index].classList.remove('selected');
            });
        }
        
        updateActionButtons();
    }

    /**
     * 一括申請登録ハンドラ
     */
    function handleBulkApplication() {
        if (selectedRecords.size === 0) {
            showError('申請登録する項目を選択してください。');
            return;
        }
        
        const selectedRecords = filteredData.filter(record => selectedRecords.has(record.id));
        const applicableRecords = selectedRecords.filter(record => 
            record.application_status !== 'not_required' && record.application_status !== 'completed'
        );
        
        if (applicableRecords.length === 0) {
            showError('申請可能な項目がありません。');
            return;
        }
        
        showBulkApplicationModal(applicableRecords);
    }

    /**
     * 完了マークハンドラ
     */
    function handleMarkCompleted() {
        if (selectedRecords.size === 0) {
            showError('完了マークする項目を選択してください。');
            return;
        }
        
        if (confirm(`選択した${selectedRecords.size}件を申請完了としてマークしますか？`)) {
            markAsCompleted(Array.from(selectedRecords));
        }
    }

    /**
     * キーボードショートカットハンドラ
     */
    function handleKeyDown(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'r':
                    e.preventDefault();
                    handleRefresh();
                    break;
                case 'e':
                    e.preventDefault();
                    handleExport();
                    break;
                case 'f':
                    e.preventDefault();
                    elements.searchInput.focus();
                    break;
            }
        }
        
        if (e.key === 'Escape') {
            closeApplicationModal();
            closeDetailModal();
        }
    }

    // =============================================================================
    // 📄 ページネーション
    // =============================================================================

    /**
     * ページネーションを更新
     */
    function updatePagination() {
        let totalItems, totalPages;
        
        if (isGroupedByBatch) {
            totalItems = Object.keys(groupedData).length;
        } else {
            totalItems = filteredData.length;
        }
        
        totalPages = Math.ceil(totalItems / itemsPerPage);
        
        // ページ情報を更新
        const startIndex = (currentPage - 1) * itemsPerPage + 1;
        const endIndex = Math.min(currentPage * itemsPerPage, totalItems);
        
        const paginationInfo = document.getElementById('pagination-info-text');
        if (paginationInfo) {
            if (isGroupedByBatch) {
                paginationInfo.textContent = `${totalItems}バッチ中 ${startIndex}-${endIndex}バッチを表示`;
            } else {
                paginationInfo.textContent = `${totalItems}件中 ${startIndex}-${endIndex}件を表示`;
            }
        }
        
        // ページ番号を生成
        const pageNumbers = generatePageNumbers(totalPages);
        const pageNumbersContainer = document.getElementById('page-numbers');
        if (pageNumbersContainer) {
            pageNumbersContainer.innerHTML = pageNumbers;
        }
        
        // 前へ・次へボタンの状態を更新
        const prevBtn = document.getElementById('prev-page-btn');
        const nextBtn = document.getElementById('next-page-btn');
        
        if (prevBtn) prevBtn.disabled = currentPage <= 1;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    }

    /**
     * ページ番号を生成
     */
    function generatePageNumbers(totalPages) {
        elements.pageNumbers.innerHTML = '';
        
        if (totalPages <= 1) return;
        
        const maxVisible = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        
        if (endPage - startPage + 1 < maxVisible) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `page-number ${i === currentPage ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener('click', () => changePage(i));
            elements.pageNumbers.appendChild(pageBtn);
        }
    }

    /**
     * ページを変更
     */
    function changePage(page) {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        
        if (page < 1 || page > totalPages) return;
        
        currentPage = page;
        renderTable();
        updatePagination();
        
        // テーブルの先頭にスクロール
        elements.historyTable.scrollIntoView({ behavior: 'smooth' });
    }

    // =============================================================================
    // 🔧 ユーティリティ関数
    // =============================================================================

    /**
     * 全選択チェックボックスを更新
     */
    function updateSelectAllCheckbox() {
        const checkboxes = document.querySelectorAll('.row-checkbox');
        const checkedCount = document.querySelectorAll('.row-checkbox:checked').length;
        
        if (checkedCount === 0) {
            elements.selectAllCheckbox.indeterminate = false;
            elements.selectAllCheckbox.checked = false;
        } else if (checkedCount === checkboxes.length) {
            elements.selectAllCheckbox.indeterminate = false;
            elements.selectAllCheckbox.checked = true;
        } else {
            elements.selectAllCheckbox.indeterminate = true;
            elements.selectAllCheckbox.checked = false;
        }
    }

    /**
     * アクションボタンを更新
     */
    function updateActionButtons() {
        const hasSelection = selectedRecords.size > 0;
        elements.bulkApplicationBtn.disabled = !hasSelection;
        elements.markCompletedBtn.disabled = !hasSelection;
    }

    /**
     * CSVデータを生成
     */
    function generateCSV(data) {
        const headers = [
            '更新日時', '更新者', '台帳種別', 'レコードキー', '更新内容',
            '申請状況', '申請番号', '申請期限', '備考'
        ];
        
        const rows = data.map(record => [
            formatDateTime(record.update_date),
            record.updater,
            getLedgerDisplayName(record.ledger_type),
            record.record_key,
            record.changes.map(c => `${c.field}: ${c.old} → ${c.new}`).join('; '),
            getStatusText(record.application_status),
            record.application_number || '',
            record.application_deadline ? formatDate(record.application_deadline) : '',
            record.notes || ''
        ]);
        
        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        
        return '\uFEFF' + csvContent; // BOM付きUTF-8
    }

    /**
     * CSVファイルをダウンロード
     */
    function downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    /**
     * 申請状況テキストを取得
     */
    function getStatusText(status) {
        const statusTexts = {
            'not_required': '申請不要',
            'pending': '未申請',
            'in_progress': '申請中',
            'completed': '申請完了',
            'overdue': '期限超過'
        };
        return statusTexts[status] || '不明';
    }

    /**
     * デバウンス関数
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * ローディング表示制御
     */
    function showLoading(show) {
        elements.loadingOverlay.style.display = show ? 'flex' : 'none';
    }

    /**
     * エラー表示
     */
    function showError(message) {
        alert(`エラー: ${message}`);
    }

    /**
     * 成功メッセージ表示
     */
    function showSuccess(message) {
        alert(`成功: ${message}`);
    }

    // =============================================================================
    // 🔍 モーダル機能
    // =============================================================================

    /**
     * 申請登録モーダルを表示
     */
    function showApplicationModal(record) {
        elements.applicationNumber.value = record.application_number || '';
        elements.applicationDeadline.value = record.application_deadline || '';
        elements.applicationNotes.value = record.notes || '';
        
        elements.applicationModal.dataset.recordId = record.id;
        elements.applicationModal.style.display = 'block';
        elements.applicationNumber.focus();
    }

    /**
     * 申請登録モーダルを閉じる
     */
    function closeApplicationModal() {
        elements.applicationModal.style.display = 'none';
        elements.applicationModal.removeAttribute('data-record-id');
        
        // フォームをクリア
        elements.applicationNumber.value = '';
        elements.applicationDeadline.value = '';
        elements.applicationNotes.value = '';
    }

    /**
     * 詳細モーダルを表示
     */
    function showDetailModal(record) {
        elements.detailModalBody.innerHTML = createDetailContent(record);
        elements.detailModal.style.display = 'block';
    }

    /**
     * 詳細モーダルを閉じる
     */
    function closeDetailModal() {
        elements.detailModal.style.display = 'none';
    }

    /**
     * 詳細コンテンツを作成
     */
    function createDetailContent(record) {
        return `
            <div class="detail-section">
                <h4 class="detail-section-title">基本情報</h4>
                <div class="detail-grid">
                    <div class="detail-label">更新日時:</div>
                    <div class="detail-value">${formatDateTime(record.update_date)}</div>
                    <div class="detail-label">更新者:</div>
                    <div class="detail-value">${record.updater}</div>
                    <div class="detail-label">台帳種別:</div>
                    <div class="detail-value">${getLedgerDisplayName(record.ledger_type)}</div>
                    <div class="detail-label">レコードキー:</div>
                    <div class="detail-value">${record.record_key}</div>
                </div>
            </div>
            
            <div class="detail-section">
                <h4 class="detail-section-title">更新内容</h4>
                <ul class="change-list">
                    ${record.changes.map(change => `
                        <li class="change-item">
                            <div class="change-field">${change.field}</div>
                            <div class="change-values">
                                <span class="old-value">${change.old}</span> → 
                                <span class="new-value">${change.new}</span>
                            </div>
                        </li>
                    `).join('')}
                </ul>
            </div>
            
            <div class="detail-section">
                <h4 class="detail-section-title">申請情報</h4>
                <div class="detail-grid">
                    <div class="detail-label">申請状況:</div>
                    <div class="detail-value">${createStatusBadge(record.application_status)}</div>
                    <div class="detail-label">申請番号:</div>
                    <div class="detail-value">${record.application_number || '-'}</div>
                    <div class="detail-label">申請期限:</div>
                    <div class="detail-value">${record.application_deadline ? formatDate(record.application_deadline) : '-'}</div>
                    <div class="detail-label">備考:</div>
                    <div class="detail-value">${record.notes || '-'}</div>
                </div>
            </div>
        `;
    }

    // =============================================================================
    // 🔄 データ更新機能
    // =============================================================================

    /**
     * 申請情報を保存
     */
    async function saveApplicationInfo() {
        const applicationModal = document.getElementById('application-modal');
        if (!applicationModal) return;

        const recordId = applicationModal.dataset.recordId;
        const applicationNumber = document.getElementById('application-number')?.value.trim();
        const applicationDeadline = document.getElementById('application-deadline')?.value;
        const notes = document.getElementById('application-notes')?.value.trim();
        
        if (!applicationNumber) {
            showError('申請番号を入力してください。');
            return;
        }
        
        try {
            showLoading(true);
            
            await updateApplicationInfo(recordId, {
                application_number: applicationNumber,
                application_deadline: applicationDeadline,
                application_status: 'in_progress',
                notes: notes
            });
            
            // ローカルデータを更新
            const record = historyData.find(r => r.id === recordId);
            if (record) {
                record.application_number = applicationNumber;
                record.application_deadline = applicationDeadline;
                record.application_status = 'in_progress';
                record.notes = notes;
            }
            
            closeApplicationModal();
            applyFilters();
            updateStatistics();
            showSuccess('申請情報を登録しました。');
            
        } catch (error) {
            console.error('❌ 申請情報保存エラー:', error);
            showError('申請情報の保存に失敗しました。');
        } finally {
            showLoading(false);
        }
    }

    /**
     * 申請情報を更新
     */
    async function updateApplicationInfo(recordId, updateData) {
        try {
            const historyAppId = window.LedgerV2.Config.APP_IDS.HISTORY;
            if (!historyAppId) {
                throw new Error('更新履歴台帳のアプリIDが設定されていません');
            }

            const record = {};
            if (updateData.application_number) {
                record.申請番号 = { value: updateData.application_number };
            }
            if (updateData.application_deadline) {
                record.申請期限 = { value: updateData.application_deadline };
            }
            if (updateData.application_status) {
                record.申請状況 = { value: updateData.application_status };
            }
            if (updateData.notes) {
                record.備考 = { value: updateData.notes };
            }

            await kintone.api('/k/v1/record', 'PUT', {
                app: historyAppId,
                id: recordId,
                record: record
            });

        } catch (error) {
            console.error('❌ 申請情報更新エラー:', error);
            throw error;
        }
    }

    /**
     * 完了マークを設定
     */
    async function markAsCompleted(recordIds) {
        try {
            showLoading(true);
            
            await Promise.all(recordIds.map(id => 
                updateApplicationInfo(id, { application_status: 'completed' })
            ));
            
            // ローカルデータを更新
            recordIds.forEach(id => {
                const record = historyData.find(r => r.id === id);
                if (record) {
                    record.application_status = 'completed';
                }
            });
            
            selectedRecords.clear();
            applyFilters();
            updateStatistics();
            showSuccess(`${recordIds.length}件を申請完了としてマークしました。`);
            
        } catch (error) {
            console.error('❌ 完了マーク設定エラー:', error);
            showError('完了マークの設定に失敗しました。');
        } finally {
            showLoading(false);
        }
    }

    // =============================================================================
    // 🌐 グローバル公開
    // =============================================================================

    // 履歴管理システムをグローバルに公開
    window.HistorySystem = {
        init: initHistorySystem,
        loadData: loadHistoryData,
        applyFilters: applyFilters,
        exportData: handleExport
    };

    // DOM読み込み完了後に初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHistorySystem);
    } else {
        initHistorySystem();
    }

    console.log('✅ 更新履歴管理システム JavaScript 読み込み完了');

    // バッチ別表示の切り替え
    function toggleBatchGrouping() {
        isGroupedByBatch = !isGroupedByBatch;
        
        // ボタンの表示を更新
        const button = elements.groupByBatchBtn;
        if (isGroupedByBatch) {
            button.innerHTML = '<span class="btn-icon">📋</span>通常表示';
            button.classList.add('active');
        } else {
            button.innerHTML = '<span class="btn-icon">📊</span>バッチ別表示';
            button.classList.remove('active');
        }
        
        // データを再描画
        if (isGroupedByBatch) {
            groupDataByBatch();
            renderGroupedTable();
        } else {
            renderTable();
        }
        
        updatePagination();
    }

    // バッチ別にデータをグループ化
    function groupDataByBatch() {
        groupedData = {};
        
        filteredData.forEach(record => {
            const batchId = record.batch_id || '不明';
            if (!groupedData[batchId]) {
                groupedData[batchId] = {
                    batchId: batchId,
                    records: [],
                    updateDate: record.update_date,
                    updater: record.updater,
                    totalRecords: 0
                };
            }
            groupedData[batchId].records.push(record);
            groupedData[batchId].totalRecords++;
            
            // 最新の更新日時を保持
            if (new Date(record.update_date) > new Date(groupedData[batchId].updateDate)) {
                groupedData[batchId].updateDate = record.update_date;
            }
        });
        
        // バッチIDでソート（更新日時の降順）
        const sortedBatches = Object.values(groupedData).sort((a, b) => {
            return new Date(b.updateDate) - new Date(a.updateDate);
        });
        
        // ソート済みのオブジェクトを再構築
        const sortedGroupedData = {};
        sortedBatches.forEach(batch => {
            sortedGroupedData[batch.batchId] = batch;
        });
        groupedData = sortedGroupedData;
    }

    // グループ化されたテーブルを描画
    function renderGroupedTable() {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const batchIds = Object.keys(groupedData);
        const pageBatches = batchIds.slice(startIndex, startIndex + itemsPerPage);
        
        elements.historyTableBody.innerHTML = '';
        
        pageBatches.forEach(batchId => {
            const batchGroup = groupedData[batchId];
            
            // バッチヘッダー行を作成
            const headerRow = document.createElement('tr');
            headerRow.className = 'batch-header-row';
            headerRow.innerHTML = `
                <td colspan="11" class="batch-header">
                    <div class="batch-info">
                        <span class="batch-toggle" data-batch-id="${batchId}">▼</span>
                        <strong>バッチID: ${batchId}</strong>
                        <span class="batch-meta">
                            (${formatDateTime(batchGroup.updateDate)} | ${batchGroup.updater} | ${batchGroup.totalRecords}件)
                        </span>
                    </div>
                </td>
            `;
            elements.historyTableBody.appendChild(headerRow);
            
            // バッチ内のレコード行を作成
            const batchBodyContainer = document.createElement('tbody');
            batchBodyContainer.className = 'batch-body';
            batchBodyContainer.dataset.batchId = batchId;
            
            batchGroup.records.forEach(record => {
                const row = createTableRow(record);
                row.classList.add('batch-record-row');
                batchBodyContainer.appendChild(row);
            });
            
            elements.historyTableBody.appendChild(batchBodyContainer);
        });
        
        // バッチの展開/折りたたみイベントを設定
        document.querySelectorAll('.batch-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                const batchId = e.target.dataset.batchId;
                const batchBody = document.querySelector(`tbody[data-batch-id="${batchId}"]`);
                const isExpanded = toggle.textContent === '▼';
                
                if (isExpanded) {
                    toggle.textContent = '▶';
                    batchBody.style.display = 'none';
                } else {
                    toggle.textContent = '▼';
                    batchBody.style.display = '';
                }
            });
        });
        
        // 全選択チェックボックスの状態を更新
        updateSelectAllCheckbox();
    }

})(); 