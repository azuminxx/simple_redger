/**
 * フォーム作成クラス
 */
class FormBuilder {
    /**
     * 検索フォームを作成（動的フィールド情報対応）
     */
    static async createSearchForm(appId, appConfig) {
        const searchForm = DOMHelper.createElement('div', {}, 'search-form');

        try {
            // 動的にフィールド情報を取得
            const fields = await CONFIG.getAppFields(appId);
            
            for (const field of fields) {
                const fieldGroup = DOMHelper.createElement('div', {}, 'field-group');

                const label = DOMHelper.createElement('label');
                label.textContent = field.label + ':';
                label.setAttribute('for', `${field.code}-${appId}`);

                let inputElement;

                if (field.type === 'dropdown' || field.type === 'radio') {
                    inputElement = this.createDropdownElement(field, appId);
                } else if (field.type === 'checkbox') {
                    inputElement = this.createCheckboxElement(field, appId);
                } else if (field.type === 'number') {
                    inputElement = this.createNumberInputElement(field, appId);
                } else if (field.type === 'date') {
                    inputElement = this.createDateInputElement(field, appId);
                } else if (field.type === 'datetime-local') {
                    inputElement = this.createDateTimeInputElement(field, appId);
                } else {
                    inputElement = this.createTextInputElement(field, appId);
                }

                fieldGroup.appendChild(label);
                fieldGroup.appendChild(inputElement);
                searchForm.appendChild(fieldGroup);
            }

            const buttonGroup = this.createButtonGroup(appId);
            searchForm.appendChild(buttonGroup);

        } catch (error) {
            console.error(`App ${appId}のフォーム作成エラー:`, error);
            
            // エラー時はエラーメッセージを表示
            const errorMessage = DOMHelper.createElement('div', {}, 'error-message');
            errorMessage.textContent = `フィールド情報の取得に失敗しました: ${error.message}`;
            searchForm.appendChild(errorMessage);
            
            // 最低限のボタンは表示
            const buttonGroup = this.createButtonGroup(appId);
            searchForm.appendChild(buttonGroup);
        }

        return searchForm;
    }

    /**
     * ドロップダウン要素を作成
     */
    static createDropdownElement(field, appId) {
        const inputElement = DOMHelper.createElement('select', {
            id: `${field.code}-${appId}`,
            name: field.code
        });

        if (field.options && Array.isArray(field.options)) {
            field.options.forEach(option => {
                const optionElement = DOMHelper.createElement('option', {
                    value: option
                });
                optionElement.textContent = option === '' ? '選択してください' : option;
                inputElement.appendChild(optionElement);
            });
        } else {
            // オプションが無い場合のフォールバック
            const defaultOption = DOMHelper.createElement('option', { value: '' });
            defaultOption.textContent = '選択してください';
            inputElement.appendChild(defaultOption);
        }

        return inputElement;
    }

    /**
     * チェックボックス要素を作成
     */
    static createCheckboxElement(field, appId) {
        const container = DOMHelper.createElement('div', {}, 'checkbox-container');
        
        if (field.options && Array.isArray(field.options)) {
            field.options.forEach((option, index) => {
                if (option === '') return; // 空の選択肢はスキップ
                
                const checkboxWrapper = DOMHelper.createElement('div', {}, 'checkbox-wrapper');
                
                const checkbox = DOMHelper.createElement('input', {
                    type: 'checkbox',
                    id: `${field.code}-${appId}-${index}`,
                    name: `${field.code}-${appId}`,
                    value: option
                });
                
                const label = DOMHelper.createElement('label');
                label.setAttribute('for', `${field.code}-${appId}-${index}`);
                label.textContent = option;
                
                checkboxWrapper.appendChild(checkbox);
                checkboxWrapper.appendChild(label);
                container.appendChild(checkboxWrapper);
            });
        }
        
        return container;
    }

    /**
     * 数値入力要素を作成
     */
    static createNumberInputElement(field, appId) {
        return DOMHelper.createElement('input', {
            type: 'number',
            id: `${field.code}-${appId}`,
            name: field.code,
            placeholder: field.placeholder
        });
    }

    /**
     * 日付入力要素を作成
     */
    static createDateInputElement(field, appId) {
        return DOMHelper.createElement('input', {
            type: 'date',
            id: `${field.code}-${appId}`,
            name: field.code,
            placeholder: field.placeholder
        });
    }

    /**
     * 日時入力要素を作成
     */
    static createDateTimeInputElement(field, appId) {
        return DOMHelper.createElement('input', {
            type: 'datetime-local',
            id: `${field.code}-${appId}`,
            name: field.code,
            placeholder: field.placeholder
        });
    }

    /**
     * テキスト入力要素を作成
     */
    static createTextInputElement(field, appId) {
        return DOMHelper.createElement('input', {
            type: 'text',
            id: `${field.code}-${appId}`,
            name: field.code,
            placeholder: field.placeholder
        });
    }

    /**
     * ボタングループを作成
     */
    static createButtonGroup(appId) {
        const buttonGroup = DOMHelper.createElement('div', {}, 'button-group');

        const searchButton = DOMHelper.createElement('button', {}, 'search-button');
        searchButton.textContent = '検索';
        searchButton.addEventListener('click', () => {
            if (window.searchEngine) {
                window.searchEngine.searchRecords(appId);
            }
        });

        const clearButton = DOMHelper.createElement('button', {}, 'clear-button');
        clearButton.textContent = 'クリア';
        clearButton.addEventListener('click', () => this.clearForm(appId));

        buttonGroup.appendChild(searchButton);
        buttonGroup.appendChild(clearButton);

        return buttonGroup;
    }

    /**
     * フォームをクリア
     */
    static clearForm(appId) {
        const tabContent = document.querySelector(`#tab-${appId}`);
        if (!tabContent) return;
        
        // テキスト入力をクリア
        const inputs = tabContent.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], input[type="datetime-local"]');
        inputs.forEach(input => {
            input.value = '';
        });

        // セレクトボックスをリセット
        const selects = tabContent.querySelectorAll('select');
        selects.forEach(select => {
            select.selectedIndex = 0;
        });

        // チェックボックスをクリア
        const checkboxes = tabContent.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
    }
}

// グローバルに公開
window.FormBuilder = FormBuilder; 