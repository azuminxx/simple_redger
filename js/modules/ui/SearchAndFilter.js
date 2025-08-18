/**
 * Search and Filter controller for the integrated table
 * 役割:
 * - 検索UIの生成とイベント管理
 * - 絞り込み（実行/解除）
 * - トグルボタン状態更新
 * - DOMフラグ/チェック管理
 */
class SearchAndFilter {
    constructor(tableRenderer) {
        this.tableRenderer = tableRenderer;
        this.integratedResultsContainer = null;
        this.positiveInput = null;
        this.negativeInput = null;
        this.positiveLogicSelect = null;
        this.negativeLogicSelect = null;
    }

    // 検索UIを構築し、ハンドラをアタッチ
    build(integratedResultsContainer) {
        this.integratedResultsContainer = integratedResultsContainer;

        const searchBoxWrapper = DOMHelper.createElement('div', {}, 'search-box-wrapper');
        searchBoxWrapper.style.fontSize = '12px';

        // 肯定系検索
        this.positiveInput = DOMHelper.createElement('input', { type: 'text', id: 'positive-search-input', placeholder: 'カンマ、スペース、改行で複数指定可（列名は 列名:検索値 で指定可）', autocomplete: 'off' }, 'positive-search-input');
        this.positiveInput.style.marginRight = '1em';
        this.positiveInput.style.fontSize = '12px';
        this.positiveInput.style.height = '32px';
        this.positiveInput.style.width = '500px';
        this.positiveInput.style.border = '1px solid #ced4da';

        // 否定系検索
        this.negativeInput = DOMHelper.createElement('input', { type: 'text', id: 'negative-search-input', placeholder: 'カンマ、スペース、改行で複数指定可（列名は 列名:検索値 で指定可）', autocomplete: 'off' }, 'negative-search-input');
        this.negativeInput.style.fontSize = '12px';
        this.negativeInput.style.height = '32px';
        this.negativeInput.style.width = '500px';
        this.negativeInput.style.border = '1px solid #ced4da';

        // 条件結合方法選択 - 肯定
        const positiveLogicLabel = DOMHelper.createElement('label');
        positiveLogicLabel.textContent = '➕検索条件:';
        positiveLogicLabel.setAttribute('for', 'positive-logic-select');
        this.positiveLogicSelect = DOMHelper.createElement('select', { id: 'positive-logic-select' }, 'positive-logic-select');
        const positiveOrOption = DOMHelper.createElement('option', { value: 'or' }, 'positive-or-option');
        positiveOrOption.textContent = 'OR';
        const positiveAndOption = DOMHelper.createElement('option', { value: 'and' }, 'positive-and-option');
        positiveAndOption.textContent = 'AND';
        this.positiveLogicSelect.style.fontSize = '12px';
        this.positiveLogicSelect.style.height = '37.2px';
        this.positiveLogicSelect.style.border = '1px solid #ced4da';
        this.positiveLogicSelect.appendChild(positiveOrOption);
        this.positiveLogicSelect.appendChild(positiveAndOption);

        // 条件結合方法選択 - 否定
        const negativeLogicLabel = DOMHelper.createElement('label');
        negativeLogicLabel.textContent = '➖除外条件:';
        negativeLogicLabel.setAttribute('for', 'negative-logic-select');
        this.negativeLogicSelect = DOMHelper.createElement('select', { id: 'negative-logic-select' }, 'negative-logic-select');
        const negativeOrOption = DOMHelper.createElement('option', { value: 'or' }, 'negative-or-option');
        negativeOrOption.textContent = 'OR';
        const negativeAndOption = DOMHelper.createElement('option', { value: 'and' }, 'negative-and-option');
        negativeAndOption.textContent = 'AND';
        this.negativeLogicSelect.style.fontSize = '12px';
        this.negativeLogicSelect.style.height = '37.2px';
        this.negativeLogicSelect.style.border = '1px solid #ced4da';
        this.negativeLogicSelect.appendChild(negativeOrOption);
        this.negativeLogicSelect.appendChild(negativeAndOption);

        // クリアボタン
        const clearButton = DOMHelper.createElement('button', { type: 'button' }, 'clear-search-button');
        clearButton.textContent = '条件をクリアする';
        clearButton.style.fontSize = '12px';
        clearButton.style.height = '32px';
        clearButton.style.border = '1px solid #ced4da';
        clearButton.style.backgroundColor = '#f8f9fa';
        clearButton.style.cursor = 'pointer';
        clearButton.style.marginLeft = '0.5em';
        clearButton.addEventListener('click', () => {
            this.positiveInput.value = '';
            this.negativeInput.value = '';
            this.resetFilterState();
            this.handleSearch();
        });

        // DOM組立
        searchBoxWrapper.appendChild(positiveLogicLabel);
        searchBoxWrapper.appendChild(this.positiveLogicSelect);
        searchBoxWrapper.appendChild(this.positiveInput);
        searchBoxWrapper.appendChild(negativeLogicLabel);
        searchBoxWrapper.appendChild(this.negativeLogicSelect);
        searchBoxWrapper.appendChild(this.negativeInput);
        searchBoxWrapper.appendChild(clearButton);
        this.integratedResultsContainer.appendChild(searchBoxWrapper);

        // イベント
        this.positiveInput.addEventListener('input', this.handleSearch.bind(this));
        this.negativeInput.addEventListener('input', this.handleSearch.bind(this));
        this.positiveLogicSelect.addEventListener('change', this.handleSearch.bind(this));
        this.negativeLogicSelect.addEventListener('change', this.handleSearch.bind(this));
    }

    // 検索実行（元のhandleSearch相当）
    handleSearch() {
        const positiveRaw = this.positiveInput.value.trim();
        const negativeRaw = this.negativeInput.value.trim();
        const positiveKeywords = positiveRaw.split(/[\s,\r\n]+/).filter(Boolean);
        const negativeKeywords = negativeRaw.split(/[\s,\r\n]+/).filter(Boolean);
        const positiveLogic = this.positiveLogicSelect.value;
        const negativeLogic = this.negativeLogicSelect.value;

        let filteredData;
        if (positiveKeywords.length === 0 && negativeKeywords.length === 0) {
            filteredData = this.tableRenderer._originalIntegratedData;
        } else {
            filteredData = this.tableRenderer._originalIntegratedData.filter((row, rowIndex) => {
                const positiveOk = positiveKeywords.length === 0 || (positiveLogic === 'or' ? 
                    positiveKeywords.some(keyword => this.evaluateKeyword(row, rowIndex, keyword, true)) :
                    positiveKeywords.every(keyword => this.evaluateKeyword(row, rowIndex, keyword, true))
                );

                const negativeOk = negativeKeywords.length === 0 || (negativeLogic === 'or' ? 
                    negativeKeywords.every(keyword => this.evaluateKeyword(row, rowIndex, keyword, false)) :
                    negativeKeywords.some(keyword => this.evaluateKeyword(row, rowIndex, keyword, false))
                );

                return negativeOk && positiveOk;
            });
        }

        // 再描画
        this.tableRenderer.currentSearchResults = filteredData;
        this.tableRenderer.updateSearchResultCount(filteredData.length);

        const oldTable = this.integratedResultsContainer.querySelector('.integrated-table-container');
        let savedChangeFlags = null;
        let savedChangedFields = null;
        let savedOriginalValues = null;
        let savedScrollTop = 0;
        if (window.virtualScroll && oldTable) {
            savedChangeFlags = new Map(window.virtualScroll.changeFlags);
            savedChangedFields = new Map(window.virtualScroll.changedFields);
            savedOriginalValues = new Map(window.virtualScroll.originalValues);
            const scrollContainer = oldTable.querySelector('.virtual-scroll-container');
            if (scrollContainer) {
                savedScrollTop = scrollContainer.scrollTop;
            }
        }

        const newTable = this.tableRenderer.virtualScroll.createVirtualScrollTable(filteredData);
        if (window.virtualScroll && savedChangeFlags) {
            window.virtualScroll.changeFlags = savedChangeFlags;
            window.virtualScroll.changedFields = savedChangedFields;
            window.virtualScroll.originalValues = savedOriginalValues;
            window.virtualScroll.restoreChangeFlagsUI();
            if (savedScrollTop > 0) {
                setTimeout(() => {
                    const newScrollContainer = newTable.querySelector('.virtual-scroll-container');
                    if (newScrollContainer) {
                        newScrollContainer.scrollTop = savedScrollTop;
                    }
                }, 100);
            }
        }
        if (oldTable && newTable) {
            oldTable.parentNode.replaceChild(newTable, oldTable);
        }
    }

    // キーワード評価（肯定/否定）
    evaluateKeyword(row, rowIndex, keyword, isPositive) {
        if (keyword.includes(':')) {
            const [fieldName, searchValue] = keyword.split(':', 2);
            if (fieldName.toLowerCase() === '整合' || fieldName.toLowerCase() === 'consistency') {
                const consistencyResult = this.tableRenderer.getConsistencyResult(row);
                return isPositive
                    ? (consistencyResult && consistencyResult.toLowerCase().includes(searchValue.toLowerCase()))
                    : !(consistencyResult && consistencyResult.toLowerCase().includes(searchValue.toLowerCase()));
            }
            const matchingKeys = Object.keys(row).filter(key => {
                const column = CONFIG.integratedTableConfig.columns.find(col => col.key === key);
                return column && column.label.toLowerCase().includes(fieldName.toLowerCase());
            });
            if (isPositive) {
                return matchingKeys.some(matchingKey => {
                    const value = row[matchingKey];
                    if (searchValue === '""' || searchValue === "''") {
                        return !value || value.toString().trim() === '';
                    }
                    return value && value.toString().toLowerCase().includes(searchValue.toLowerCase());
                });
            } else {
                return matchingKeys.every(matchingKey => {
                    const value = row[matchingKey];
                    if (searchValue === '""' || searchValue === "''") {
                        return value && value.toString().trim() !== '';
                    }
                    return !(value && value.toString().toLowerCase().includes(searchValue.toLowerCase()));
                });
            }
        }
        // 通常の検索（部分一致） - DOM属性/整合結果も含む
        const searchableValues = this.tableRenderer.getSearchableValues(row);
        const consistencyResult = this.tableRenderer.getConsistencyResult(row);
        if (consistencyResult) searchableValues.push(consistencyResult);
        const domFlags = this.getDOMFlagsForRow(rowIndex);
        searchableValues.push(...domFlags);
        if (isPositive) {
            return searchableValues.some(val => val && val.toString().toLowerCase().includes(keyword.toLowerCase()));
        }
        return !searchableValues.some(val => val && val.toString().toLowerCase().includes(keyword.toLowerCase()));
    }

    // 指定行のDOM要素からフラグ属性を取得
    getDOMFlagsForRow(rowIndex) {
        const flags = [];
        if (this.tableRenderer.checkedRows && this.tableRenderer.checkedRows.has(rowIndex)) {
            flags.push(this.tableRenderer.filterFlag);
            return flags;
        }
        const rowElement = document.querySelector(`tr[data-record-index="${rowIndex}"]`);
        if (rowElement) {
            const filterFlag = rowElement.getAttribute('data-filter-flag');
            if (filterFlag) flags.push(filterFlag);
        }
        return flags;
    }

    // 絞り込み実行
    executeFilterBySearch() {
        if (this.tableRenderer.checkedRows.size === 0) {
            console.warn('絞り込み対象の行が選択されていません');
            return;
        }
        const positiveInput = document.querySelector('#positive-search-input');
        if (positiveInput) {
            positiveInput.value = this.tableRenderer.filterFlag;
            const searchEvent = new Event('input', { bubbles: true });
            positiveInput.dispatchEvent(searchEvent);
            this.tableRenderer.isFiltered = true;
            this.clearAllCheckboxes();
            this.updateAllToggleButtons();
        } else {
            console.error('❌ テーブル内検索のinputボックスが見つかりません');
        }
    }

    // 絞り込み解除
    clearFilterBySearch() {
        const positiveInput = document.querySelector('#positive-search-input');
        if (positiveInput) {
            positiveInput.value = '';
            const searchEvent = new Event('input', { bubbles: true });
            positiveInput.dispatchEvent(searchEvent);
        }
        const flaggedRows = document.querySelectorAll(`[data-filter-flag="${this.tableRenderer.filterFlag}"]`);
        flaggedRows.forEach(row => row.removeAttribute('data-filter-flag'));
        this.tableRenderer.checkedRows.clear();
        const checkboxes = document.querySelectorAll('.row-checkbox');
        checkboxes.forEach(checkbox => { checkbox.checked = false; });
        this.tableRenderer.isFiltered = false;
        this.updateAllToggleButtons();
    }

    // 絞り込み状態をリセット
    resetFilterState() {
        this.tableRenderer.isFiltered = false;
        this.clearAllCheckboxes();
        const flaggedRows = document.querySelectorAll(`[data-filter-flag="${this.tableRenderer.filterFlag}"]`);
        flaggedRows.forEach(row => row.removeAttribute('data-filter-flag'));
        this.updateAllToggleButtons();
    }

    // トグルボタン更新
    updateToggleButtonState(button) {
        if (this.tableRenderer.isFiltered) {
            button.textContent = '解除';
            button.className = 'header-clear-button';
        } else {
            button.textContent = '絞込';
            button.className = 'header-filter-button';
        }
    }

    // 全トグルボタン更新
    updateAllToggleButtons() {
        const toggleButtons = document.querySelectorAll('.header-toggle-button, .header-filter-button, .header-clear-button');
        toggleButtons.forEach(btn => this.updateToggleButtonState(btn));
    }

    // 全チェックボックスをクリア
    clearAllCheckboxes() {
        const checkboxes = document.querySelectorAll('.row-checkbox');
        checkboxes.forEach(checkbox => { checkbox.checked = false; });
        this.tableRenderer.checkedRows.clear();
    }
}

// グローバルに公開
window.SearchAndFilter = SearchAndFilter;


