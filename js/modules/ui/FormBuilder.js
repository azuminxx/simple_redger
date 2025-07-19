/**
 * フォーム作成クラス
 */
class FormBuilder {
    /**
     * 検索フォームを作成
     */
    static createSearchForm(appId, appConfig) {
        const searchForm = DOMHelper.createElement('div', {}, 'search-form');

        const fields = CONFIG.getAppFields(appId);
        fields.forEach(field => {
            const fieldGroup = DOMHelper.createElement('div', {}, 'field-group');

            const label = DOMHelper.createElement('label');
            label.textContent = field.label + ':';
            label.setAttribute('for', `${field.code}-${appId}`);

            let inputElement;

            if (field.type === 'dropdown') {
                inputElement = this.createDropdownElement(field, appId);
            } else {
                inputElement = this.createTextInputElement(field, appId);
            }

            fieldGroup.appendChild(label);
            fieldGroup.appendChild(inputElement);
            searchForm.appendChild(fieldGroup);
        });

        const buttonGroup = this.createButtonGroup(appId);
        searchForm.appendChild(buttonGroup);

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

        field.options.forEach(option => {
            const optionElement = DOMHelper.createElement('option', {
                value: option
            });
            optionElement.textContent = option === '' ? '選択してください' : option;
            inputElement.appendChild(optionElement);
        });

        return inputElement;
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
        
        const inputs = tabContent.querySelectorAll('input[type="text"]');
        inputs.forEach(input => {
            input.value = '';
        });

        const selects = tabContent.querySelectorAll('select');
        selects.forEach(select => {
            select.selectedIndex = 0;
        });
    }
}

// グローバルに公開
window.FormBuilder = FormBuilder; 