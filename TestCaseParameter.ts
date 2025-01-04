import { Checkbox, TextField, Dropdown, Button } from "@vscode/webview-ui-toolkit";
import IUnitTreetable from "../Tables/TreeTable";
import { IUnitJSONParser } from "../../Parser/IUnitJSONParser";
import { JsonGeneratorModel } from "../../Parser/JsonGeneratorModel";
import { iUnitCommands } from "../../Static/iUnitCommands";
import { HtmlHelper } from "../HtmlHelper";
import { IUnitConsts, InputMethod, Options } from "../../Static/IUnitStringUtils";
import messageHandler from "../../Panels/MessageHandler";
import { BaseResultPayload } from "../../Junit/Utils/TestRunnerTypes";
import { FileFieldParams } from "../../afs-api/parameter-api";
import { LoadDbContext } from "../../Panels/LoadFromDBStepper";
import { ArrayParameters, Assertion, dataTypeRegex, Mode, OutPutMethod, ParameterProps, TestCaseArrayCreationJSONPayload } from "./model";
import { getParameterTableRow } from "./table-helper";
import { getTestCaseParameters } from "./helper";
import { generateTestExecutionResult } from "./utilities";
import { Parameter } from "../../models/testcase";

export class IUnitParametersModel {
    private table: HTMLTableElement;
    private tablenoParaminfo: HTMLDivElement;
    private saveTestCaseBtn: Button;
    private doNotExecChk: Checkbox;
    private sameasinputChk: Checkbox;
    private parameters: Parameter[];
    private testcaseid: number | undefined;
    private assertion: Dropdown;
    private parameterTable: IUnitTreetable;
    private isiunitrequest: boolean = false;
    constructor(props?: ParameterProps) {
        this.testcaseid = props.id;
        this.parameters = props.parameters;
        this.isiunitrequest = props.isiunitrequest;
        this.table = document.querySelector("#test-case-parameters tbody");
        this.tablenoParaminfo = document.querySelector(".tableContainer > div");
        this.saveTestCaseBtn = document.getElementById("saveTestCaseParam") as Button;
        this.doNotExecChk = document.getElementById("executionCheckbox") as Checkbox;
        this.sameasinputChk = document.getElementById("outputCheckbox") as Checkbox;
        this.assertion = document.getElementById("assertionType") as Dropdown;
        if (this.doNotExecChk) {
            this.doNotExecChk.checked = false;
        }
        if (this.sameasinputChk) {
            this.sameasinputChk.checked = false;
        }
    }
    createExpectedRes(mode: Mode) {
        this.initializeWindow(mode);
        this.parameters.forEach((parameter) => {
            const row = HtmlHelper.createRow();
            this.createNewParameterRow(parameter, row);
            this.table.appendChild(row);
        });


        this.parameterTable = new IUnitTreetable(this.table);
        this.parameterTable.collapseAll();
        this.addValidation();
        this.initListeners(this.table);
        this.saveTestCaseBtn.onclick = async () => {
            await getTestCaseParameters(this.table).then(async (parameters) => {
                let testcaseParam: BaseResultPayload | undefined = undefined;
                let expectedAssertion: string;
                if (this.assertion.currentValue === Assertion.success) {
                    expectedAssertion = 'S';
                } else if (this.assertion.currentValue === Assertion.failure) {
                    expectedAssertion = 'F';
                } else if (this.assertion.currentValue === Assertion.error) {
                    expectedAssertion = 'E';
                }
                parameters.forEach((item, index) => {
                    this.parameters[index].inputValueAsString = this.convertDecimal(item.inputvalue);
                    this.parameters[index].inputMethod = item.inputmethod;
                    this.parameters[index].outputMethod = item.outputmethod;
                    this.parameters[index].ouputValueAsString = this.convertDecimal(item.outputvalue);
                    this.parameters[index].compValueAsString = item.comparevalue;
                });
                testcaseParam = {
                    baseresult: {
                        setforfailcase: this.doNotExecChk.checked,
                        expectedassertion: expectedAssertion,
                        jsonParameterString: {
                            inputJsonString: IUnitJSONParser.createJSONStructure(this.parameters, false, false),
                            outputJsonString: IUnitJSONParser.createJSONStructure(this.parameters, true, false),
                            compareJsonString: IUnitJSONParser.createJSONStructure(this.parameters, true, true)
                        }
                    }
                };
                if (testcaseParam !== undefined || null) {
                    if (mode === Mode.create) {
                        this.saveTestCaseBtn.disabled = true;
                    }
                    const command = this.isiunitrequest ? iUnitCommands.SAVE_EXPECTED_RESULT : iUnitCommands.JUNIT_SAVE_BASE_RESULT;
                    messageHandler.postMessage(command, { testcaseid: this.testcaseid, param: testcaseParam, mode: mode }).then(async (result) => {
                        if (result !== undefined && !testcaseParam.baseresult.setforfailcase) {
                            const header = ["parametername", "datatype", "inputvalue", "expectedvalue"];
                            generateTestExecutionResult(result.baseresult, header);
                        }
                    });
                }
            });
        };
    }
    initListeners(table: HTMLTableElement) {
        for (let index = 0; index < table.rows.length; index++) {
            const row = table.rows[index];
            const option: Dropdown = row.querySelector("td:nth-child(3) vscode-dropdown");
            const inputMethod: Dropdown = row.querySelector("td:nth-child(4) vscode-dropdown");
            const outPutMethod: Dropdown = row.querySelector("td:nth-child(7) vscode-dropdown");
            if (option.currentValue === Options.omit) {
                const itemToEnableDisable = row.querySelectorAll('vscode-dropdown, vscode-text-field');
                this.setParameterOption(this.parameters[index], option.currentValue, itemToEnableDisable);
            }
            if (option.currentValue === Options.nopass) {
                this.setNoPassOption(this.parameters[index]);
                break;
            }

            [inputMethod, outPutMethod].forEach((method, index) => {
                if (method.currentValue === InputMethod.db || method.currentValue === OutPutMethod.db) {
                    const field: TextField = row.querySelector(`td:nth-child(${index === 0 ? 5 : 8}) vscode-text-field`);
                    field.onclick = () => {
                        this.manageLoadFromDBContext(field, index === 0);
                    };
                }
            });
        }
    }

    private initializeWindow(mode: Mode) {
        HtmlHelper.clearHtmlElement(this.table);
        if (this.tablenoParaminfo) { this.tablenoParaminfo.remove(); }
        this.doNotExecChk.disabled = (mode === Mode.change || !this.isiunitrequest);
        this.doNotExecChk.checked = (mode === Mode.change || !this.isiunitrequest);
        if (mode !== Mode.change || this.isiunitrequest) {
            this.assertion.onchange = () => { this.handleAssertion(); };
        }
    }

    private convertDecimal(value: string): string {
        if (value.includes(".")) {
            if (value.startsWith(".")) {
                return "0" + value;
            } else {
                return value;
            }
        } else {
            return value;
        }
    }

    private createNewParameterRow(parameter: Parameter, row: HTMLTableRowElement, topElement?: any, isArray = false, isInputType = false) {
        const cells = getParameterTableRow(parameter, isArray, isInputType);
        row.innerHTML = cells.map(cell => `<td>${cell}</td>`).join("");
        const qualifiedName: string = parameter.qualName;
        let indentation: string | number;

        if (qualifiedName === "") {
            indentation = "0.34";
        } else if (qualifiedName === IUnitConsts.BEGIN_VALUE) {
            indentation = "0";
        } else if (qualifiedName) {
            ;
            indentation = qualifiedName.split(".").length;
        } else {
            indentation = "0.34";
        }
        row.setAttribute("indent", String(indentation));
        switch (parameter.subFieldType) {
            case IUnitConsts.SUBFIELDTYPE_DATASTRUCTURE:
                if (parameter.qualName) {
                    let depthCount: any = parameter.qualName.split(".").length + (parameter.qualName === IUnitConsts.BEGIN_VALUE ? 0 : 1);
                    row.setAttribute("data-depth", String(depthCount));
                }
                break;
            case IUnitConsts.SUBFIELDTYPE_STANDALONE:
                row.setAttribute("data-type", parameter.subFieldType);
                break;
        }
        this.addRowItemValidation(row, parameter, topElement ? topElement.name : undefined, isArray, isInputType);
    }

    private addValidation(): void {
        this.doNotExecChk.onchange = () => {
            this.handleOnExecutionCheckbox();
        };
        this.sameasinputChk.onchange = () => {
            this.handleOnSameAsInput();
        };
    }
    private handleAssertion(): void {
        if (this.assertion.selectedIndex === 1 || this.assertion.selectedIndex === 2) {
            this.doNotExecChk.checked = true;
            this.doNotExecChk.disabled = true;
        }
        if (this.assertion.selectedIndex === 0) {
            this.doNotExecChk.checked = false;
            this.doNotExecChk.disabled = false;
        }
    }
    private handleOnSameAsInput(): void {
        const inputMethodDropdowns = document.querySelectorAll('tr td:nth-child(4) vscode-dropdown');
        const inputValueInputflds = document.querySelectorAll('tr td:nth-child(5) vscode-text-field');
        const outputMethodDropdowns = document.querySelectorAll('tr td:nth-child(7) vscode-dropdown');
        const outputValueInputflds = document.querySelectorAll('tr td:nth-child(8) vscode-text-field');

        const inputMethodDropdownsArray = Array.from(inputMethodDropdowns) as Dropdown[];
        const inputValueInputfldsArray = Array.from(inputValueInputflds) as TextField[];
        const outputMethodDropdownsArray = Array.from(outputMethodDropdowns) as Dropdown[];
        const outputValueInputfldsArray = Array.from(outputValueInputflds) as TextField[];

        if (this.sameasinputChk.checked) {
            inputMethodDropdownsArray.forEach((inputDropdown, i) => {
                const outputDropdown = outputMethodDropdownsArray[i];
                const outputValueInput = outputValueInputfldsArray[i];

                if (inputDropdown.selectedIndex !== 2) {
                    outputDropdown.selectedIndex = inputDropdown.selectedIndex;

                    if (inputDropdown.selectedIndex === 1) {
                        outputValueInput.readOnly = true;
                        outputValueInput.onclick = () => {
                            if (this.doNotExecChk.checked) {
                                outputValueInput.readOnly = true;
                                this.manageLoadFromDBContext(outputValueInput, false);
                            }
                        };
                    }
                }

                outputValueInput.value = inputValueInputfldsArray[i].value;
            });
        } else {
            outputMethodDropdownsArray.forEach(outputDropdown => outputDropdown.selectedIndex = 0);
            outputValueInputfldsArray.forEach(outputValueInput => outputValueInput.value = "");
        }
    }

    private handleOnExecutionCheckbox(): void {
        const rows = Array.from(this.table.querySelectorAll('tr'));
        for (let i = 0; i < this.parameters.length; i++) {
            const parameter = this.parameters[i];
            const itemToEnableDisable = rows[i].querySelectorAll('vscode-dropdown, vscode-text-field');
            const dataStructure = parameter.subFieldType === IUnitConsts.SUBFIELDTYPE_DATASTRUCTURE;
            const columnOutValueAllowed =
                (parameter.subFieldnumber === 0 || parameter.subFieldnumber === 1) &&
                !dataStructure &&
                !parameter.parentDataStructureArray;
            const columnOutMethodAllowed = parameter.level === 1;
            if (this.doNotExecChk.checked) {
                (itemToEnableDisable[4] as Dropdown).disabled = !columnOutMethodAllowed;
                (itemToEnableDisable[5] as TextField).readOnly = !columnOutValueAllowed;
            } else {
                (itemToEnableDisable[4] as Dropdown).disabled = true;
                (itemToEnableDisable[5] as TextField).readOnly = true;
            }
        }
    }

    private addRowItemValidation(rowItem: HTMLTableRowElement, currentParameter: Parameter, topElement?: string, isArray?: boolean, isInputType = true) {
        const itemToEnableDisable = rowItem.querySelectorAll('vscode-dropdown, vscode-text-field');
        const inputMethodDropdown = itemToEnableDisable[1] as Dropdown;
        const outPutMethodDropdown = itemToEnableDisable[4] as Dropdown;
        const inputTextField = itemToEnableDisable[2] as TextField;
        const outputTextField = itemToEnableDisable[5] as TextField;

        this.setParameterOption(currentParameter, (itemToEnableDisable[isInputType ? 1 : 0] as Dropdown).currentValue, itemToEnableDisable);

        function isIndicatorValid(input: string): boolean {
            const STR_WITH_O_PATTERN = /^[*][Oo]/;
            const ON_PATTERN = /^[*][Oo][NnFf]/;
            const OFF_PATTERN = /^[*][Oo][Ff][Ff]/;
            const STR_PATTERN = /^[*]/;
            switch (input.length) {
                case 1:
                    return STR_PATTERN.test(input);
                case 2:
                    return STR_WITH_O_PATTERN.test(input);
                case 3:
                    return ON_PATTERN.test(input);
                case 4:
                    return OFF_PATTERN.test(input);
                default:
                    return false;
            }
        }

        if (currentParameter.arrayDim > 0) {
            this.enableDisableArrayRow(rowItem, currentParameter, topElement, isInputType);
            if (currentParameter.arrayDim > 0 && currentParameter.subFieldnumber === 0 && !currentParameter.name.endsWith("]")) {
                const inputField = Array.from(itemToEnableDisable).find((item) => item.classList.contains("inputField")) as TextField;
                inputField.onfocus = (e) => {
                    e.preventDefault();
                    this.handleArrayDimensionClick(currentParameter, inputField, isInputType);
                };
            }
        } else {
            this.enableDisableRow(rowItem, currentParameter);
            if (!this.doNotExecChk.checked) {
                (itemToEnableDisable[4] as TextField).disabled = true;
                (itemToEnableDisable[5] as TextField).readOnly = true;
            }
            (itemToEnableDisable[0] as Dropdown).onchange = (e) => {
                this.setParameterOption(currentParameter, (e.target as Dropdown).currentValue, itemToEnableDisable, true);
            };
            if ((currentParameter.arrayDim > 0 && !currentParameter.parentDataStructureArray && currentParameter.subFieldnumber === 0)) {
                inputTextField.onclick = (e) => {
                    inputTextField.disabled = true;
                    this.handleArrayDimensionClick(currentParameter, inputTextField, true)
                        .finally(() => {
                            inputTextField.disabled = false;
                        });
                };
                (itemToEnableDisable[5] as TextField).onclick = (e) => {
                    const outputFieled = itemToEnableDisable[5] as TextField;
                    outputFieled.disabled = true;
                    this.handleArrayDimensionClick(currentParameter, outputFieled, false)
                        .finally(() => {
                            outputFieled.disabled = false;
                        });
                };
            }
            const inputField = rowItem.querySelector(".inputField") as TextField;
            const outputField = rowItem.querySelector(".outputField") as TextField;
            inputField.addEventListener("input", () => {
                if (this.sameasinputChk.checked) {
                    outputField.value = inputField.value;
                }
            });
            if (dataTypeRegex.test(currentParameter.dataType) && currentParameter.arrayDim === 0) {
                const inputPlaceholder = "eg.(1,2,3,4,5)";
                inputField.placeholder = inputPlaceholder;
                (inputField as any).type = "number";

                outputField.placeholder = inputPlaceholder;
                (outputField as any).type = "number";
            }
            if (/[DT]/.test(currentParameter.dataType)) {
                inputField.placeholder = "eg.(2019-01-01)";
            }
            if (/[N]/.test(currentParameter.dataType)) {
                inputField.placeholder = "eg.(*ON / *OFF)";
                inputField.addEventListener("input", () => {
                    const inputValue = inputField.value.trim();
                    const isValid = isIndicatorValid(inputValue);
                    if (!isValid) {
                        inputField.value = "";
                    } else {
                        inputField.value = inputValue.toUpperCase();
                    }
                });
                outputField.addEventListener("input", () => {
                    const inputValue = inputField.value.trim();
                    const isValid = isIndicatorValid(inputValue);
                    if (!isValid) {
                        inputField.value = "";
                    } else {
                        inputField.value = inputValue.toUpperCase();
                    }
                });
            }
        }
        if (inputMethodDropdown) {
            inputMethodDropdown.onchange = (e) => {
                if (inputMethodDropdown.selectedIndex === 1) {
                    inputTextField.value = "";
                    inputTextField.readOnly = true;
                    inputTextField.onclick = (e) => {
                        this.manageLoadFromDBContext(inputTextField, true);
                    };
                }
                else if (inputMethodDropdown.selectedIndex === 2) {
                    inputTextField.value = "";
                    inputTextField.readOnly = true;
                    inputTextField.onclick = (e) => {
                        return;
                    };
                }
                else {
                    const field: any = inputTextField;
                    field.value = currentParameter.inputValueAsString;
                    if (dataTypeRegex.test(currentParameter.dataType) && currentParameter.arrayDim === 0) {
                        const inputPlaceholder = "eg.(1,2,3,4,5)";
                        field.type = "number";
                        field.placeholder = inputPlaceholder;
                    }
                    field.readOnly = false;
                    field.onclick = () => {
                        return;
                    };
                }
            };
        }
        if (outPutMethodDropdown) {
            outPutMethodDropdown.onchange = (e) => {
                if (outPutMethodDropdown.selectedIndex === 1) {
                    outputTextField.value = "";
                    outputTextField.onclick = (e) => {
                        this.manageLoadFromDBContext(outputTextField, false);
                    };
                }
                else {
                    outputTextField.onclick = (e) => {
                        return;
                    };
                }
            };
        }

    }


    async handleArrayDimensionClick(currentParameter: Parameter, textField: TextField, isInputType?: boolean) {
        if (!currentParameter || currentParameter.arrayDim <= 0) {
            return;
        }

        let arrayParams: Parameter[] = currentParameter.arrayParameter;
        if (!arrayParams) {
            return;
        }

        const arrayParamTableHeaders = document.getElementById("arrayParameterTable").querySelectorAll("th");
        const displayValue = isInputType ? "block" : "none";
        arrayParamTableHeaders[3].style.display = displayValue;

        const templateModal = document.getElementById("popup");
        const modal = templateModal.cloneNode(true) as HTMLElement;
        const saveParamButton = modal.querySelector("#saveArrayParam") as Button;
        const shiftAmount = 10 * (document.querySelectorAll(".popup").length - 1);
        modal.style.transform = `translate(${shiftAmount}px, ${shiftAmount}px)`;

        const contentArea = modal.querySelector("#arrayParameterTable tbody") as HTMLTableElement;
        const closeButton = modal.querySelector(".closebtn") as HTMLElement;
        HtmlHelper.clearHtmlElement(contentArea);

        const topLevelParameter = { name: currentParameter.name, qualName: currentParameter.qualName };

        if (currentParameter.inputValueAsString) {
            const inputValues = IUnitJSONParser.readJSON(currentParameter.inputValueAsString, false);

            if (Array.isArray(JSON.parse(currentParameter.inputValueAsString))) {
                this.setInputValue(arrayParams, currentParameter.inputValueAsString);

            } else {
                arrayParams.forEach((parameter: Parameter, index) => {
                    if (parameter.arrayKey === inputValues[index]?.key && (!parameter.inputValueAsString || parameter.inputValueAsString === undefined)) {
                        parameter.inputValueAsString = inputValues[index].value;
                    }
                });
            }

        }

        arrayParams.forEach((parameter: Parameter) => {
            const row = HtmlHelper.createRow();
            this.createNewParameterRow(parameter, row, topLevelParameter, true, isInputType);
            contentArea.appendChild(row);
        });

        this.parameterTable = new IUnitTreetable(contentArea);
        this.parameterTable.collapseAll();

        closeButton.onclick = () => modal.remove();

        modal.style.display = "block";
        document.body.appendChild(modal);

        saveParamButton.onclick = async () => {
            const tableRows = modal.querySelectorAll("#arrayParameterTable tbody tr");

            if (tableRows) {
                const param: TestCaseArrayCreationJSONPayload = this.getArrayParamterValues(arrayParams, topLevelParameter, tableRows);
                param.parameter.parameters.forEach((element: ArrayParameters, index) => {
                    arrayParams[index].inputValueAsString = element.inputvalue;
                    arrayParams[index].compValueAsString = element.comparevalue;
                });

                currentParameter.arrayParameter = arrayParams;
                const parameters: Parameter[] = [currentParameter];

                const json = IUnitJSONParser.createJson(parameters, 0, "", new JsonGeneratorModel(), false, true, false);
                textField.value = json;
                modal.remove();
            }
        };
    }

    private setInputValue(arrayParams: Parameter[], inputValueAsString: string): void {
        const parsedJson = JSON.parse(inputValueAsString);
        arrayParams.forEach((parameter: Parameter, index) => {
            parameter.inputValueAsString = parsedJson[index];
        });
    }

    private setDefault(parameter: Parameter): void {
        parameter.inputValueAsString = "";
        parameter.ouputValueAsString = "";
        parameter.inputMethod = Options.none;
        parameter.outputMethod = Options.none;
    }


    private setDSSubFields(parameter: Parameter, paramOption: string, isParamOptionCol: boolean): void {
        const test = this.table.querySelectorAll("tr");
        for (let i = 0; i < this.parameters.length; i++) {
            const tempParam = this.parameters[i];
            if (tempParam.paramIndex >= parameter.paramIndex) {
                if (tempParam.level <= parameter.level && tempParam.name !== parameter.name) {
                    break;
                }
                if (isParamOptionCol) {
                    tempParam.paramOption = paramOption;
                    (test[i].querySelector("vscode-dropdown") as Dropdown).currentValue = paramOption;
                    const items = test[i].querySelectorAll("vscode-dropdown , vscode-text-field");
                    if (paramOption === Options.omit) {
                        items.forEach((item, index) => {
                            if (index !== 0) {
                                if (item instanceof TextField) {
                                    item.readOnly = true;
                                }
                                else if (item instanceof Dropdown) {
                                    item.disabled = true;
                                }
                            }
                        });
                    } else {
                        this.enableDisableRow(test[i], tempParam);
                    }
                    this.setDefault(tempParam);
                } else {
                    tempParam.inputMethod = paramOption;
                    if (paramOption === InputMethod.ibmi) {
                        tempParam.inputValueAsString = "";
                    }
                }
            }
        }
    }

    private setParameterOption(parameter: Parameter, choice: string, rowItem: any, onchange = false) {
        if (parameter.paramOption !== Options.none) {
            if (parameter.paramOption === Options.nopass) {
                this.removePreviousNoPassOption(parameter, choice);
            } else if (parameter.subFieldType === IUnitConsts.SUBFIELDTYPE_DATASTRUCTURE && parameter.paramOption === Options.omit && choice === Options.none) {
                this.setDSSubFields(parameter, Options.none, true);
            } else {
                rowItem.forEach((item) => {
                    if (item instanceof TextField) {
                        item.readOnly = false;
                        item.value = "";
                    } else {
                        item.disabled = false;
                    }
                });
            }
        }

        parameter.paramOption = choice;
        if (parameter.paramOption === Options.nopass) {
            parameter.startNoParam = true;
            this.setDefault(parameter);
            if (onchange) {
                this.setNoPassOption(parameter);
            }
        } else if (parameter.subFieldType === IUnitConsts.SUBFIELDTYPE_DATASTRUCTURE && parameter.paramOption === Options.omit) {
            this.setDSSubFields(parameter, Options.omit, true);
        } else if (parameter.paramOption === Options.omit) {
            rowItem.forEach((item, index: number) => {
                if (index !== 0) {
                    if (item instanceof TextField) {
                        item.readOnly = true;
                    } else if (item instanceof Dropdown) {
                        item.disabled = true;
                    }
                }
            });
            this.setDefault(parameter);
        }
    }
    private removePreviousNoPassOption(parameter: Parameter, choice: string) {
        const test = this.table.querySelectorAll("tr");
        for (let i = 0; i < this.parameters.length; i++) {
            const currentParameter = this.parameters[i];
            if (currentParameter.paramIndex >= parameter.paramIndex) {
                currentParameter.paramOption = choice;
                if (test[i] !== undefined) {
                    if ((test[i].querySelector("tr td div") as HTMLDivElement).innerText === parameter.name) {
                        (test[i].querySelector("vscode-dropdown") as Dropdown).currentValue = choice;
                    } else {
                        (test[i].querySelector("vscode-dropdown") as Dropdown).currentValue = Options.none;
                    }
                    this.enableDisableRow(test[i], currentParameter);
                }

            }
        }
    }
    private setNoPassOption(parameter: Parameter) {
        const test = this.table.querySelectorAll("tr");
        let isFirstIteration = true;
        this.parameters.forEach((tempParam, index) => {
            if (
                tempParam.paramIndex >= parameter.paramIndex &&
                tempParam.subFieldnumber === 0
            ) {
                tempParam.paramOption = Options.nopass;
                (test[index].querySelector("vscode-dropdown") as Dropdown).currentValue = Options.nopass;
                const items = test[index].querySelectorAll("vscode-dropdown , vscode-text-field");
                function enableTextField(textField: TextField): void {
                    textField.readOnly = false;
                    textField.value = "";
                }

                function disableTextField(textField: TextField): void {
                    textField.readOnly = true;
                }

                function enableDropdown(dropdown: Dropdown): void {
                    dropdown.disabled = false;
                }

                function disableDropdown(dropdown: Dropdown): void {
                    dropdown.disabled = true;
                }

                items.forEach((item, itemIndex) => {
                    if (isFirstIteration && itemIndex === 0) {
                        if (item instanceof TextField) {
                            enableTextField(item);
                        } else if (item instanceof Dropdown) {
                            enableDropdown(item);
                        }
                    } else {
                        if (item instanceof TextField) {
                            disableTextField(item);
                        } else if (item instanceof Dropdown) {
                            disableDropdown(item);
                        }
                    }
                });
                tempParam.startNoParam = false;
                this.setDefault(tempParam);
                isFirstIteration = false;
            }
        });
    }


    private allowEntry(parameters: Parameter[], dsName: string, inParam: boolean): boolean {
        for (let i = 0; i < parameters.length; i++) {
            const param: Parameter = parameters[i];
            if (dsName.toLowerCase() === param.name.toLowerCase() && inParam && param.subFieldnumber === 0) {
                if (param.parentDataStructureName !== '') {
                    return this.allowEntry(parameters, param.parentDataStructureName, inParam);
                }
                return param.inputMethod === Options.nopass;
            } else if (dsName.toLowerCase() === param.name.toLowerCase() && !inParam) {
                if (param.parentDataStructureName !== '') {
                    return this.allowEntry(parameters, param.parentDataStructureName, false);
                }
                return param.outputMethod === Options.nopass;
            }
        }
        return true;
    }

    private enableDisableRow(rowItem: HTMLElement, currentParameter: Parameter): void {
        const itemToEnableDisable = rowItem.querySelectorAll('vscode-dropdown, vscode-text-field');
        const dataStructure = currentParameter.subFieldType === IUnitConsts.SUBFIELDTYPE_DATASTRUCTURE;
        const defaultOption = currentParameter.inputMethod === InputMethod.ibmi;
        const isArray = currentParameter.arrayDim > 0;
        const allow =
            !dataStructure &&
            currentParameter.parentDataStructureName !== "" &&
            !defaultOption &&
            this.allowEntry(this.parameters, currentParameter.parentDataStructureName, true) &&
            !currentParameter.parentDataStructureArray;
        const columnValueAllowed =
            currentParameter.subFieldnumber === 0 &&
            !dataStructure &&
            !currentParameter.parentDataStructureArray &&
            !defaultOption;
        const columnOutValueAllowed =
            (currentParameter.subFieldnumber === 0 || currentParameter.subFieldnumber === 1) &&
            !dataStructure &&
            !currentParameter.parentDataStructureArray;
        const columnInMethodAllowed =
            currentParameter.level === 1 &&
            currentParameter.subFieldnumber === 0;
        const columnOperatorAllowed =
            currentParameter.level === 1 &&
            !dataStructure &&
            !isArray;
        const columnOutMethodAllowed =
            currentParameter.level === 1;
        const columnOptionAllowed =
            currentParameter.level === 1 &&
            currentParameter.subFieldnumber === 0;


        (itemToEnableDisable[0] as Dropdown).disabled = !columnOptionAllowed;
        (itemToEnableDisable[1] as Dropdown).disabled = !columnInMethodAllowed;
        (itemToEnableDisable[2] as TextField).readOnly = !columnValueAllowed;
        (itemToEnableDisable[3] as Dropdown).disabled = !columnOperatorAllowed;
        (itemToEnableDisable[4] as Dropdown).disabled = !columnOutMethodAllowed;
        (itemToEnableDisable[5] as TextField).readOnly = !columnOutValueAllowed;
        (itemToEnableDisable[2] as TextField).value = '';
        (itemToEnableDisable[5] as TextField).value = '';
    }


    private enableDisableArrayRow(rowItem: HTMLElement, currentParameter: Parameter, topElement: string, isInputType = true): void {
        const itemToEnablearray = rowItem.querySelectorAll('vscode-dropdown, vscode-text-field');
        function isEditingAllowed(parameter: Parameter, element: string): boolean {
            return (
                parameter.subFieldType === IUnitConsts.SUBFIELDTYPE_DATASTRUCTURE ||
                (parameter.parentDataStructureName !== "" &&
                    element !== parameter.parentDataStructureName &&
                    parameter.parentDataStructureArray &&
                    !parameter.name.endsWith("]"))
            );
        }
        const editingAllowed = isEditingAllowed(currentParameter, topElement);
        const arrayDimGreaterThanZero = currentParameter.arrayDim === 0 || (currentParameter.arrayDim > 0 && currentParameter.subFieldType === "SF");
        if (isInputType) {
            (itemToEnablearray[0] as TextField).readOnly = editingAllowed;
            (itemToEnablearray[1] as Dropdown).disabled = editingAllowed || arrayDimGreaterThanZero;
        }
        else {
            (itemToEnablearray[0] as TextField).readOnly = editingAllowed;
        }
    }

    private getArrayParamterValues(result: Parameter[], topElement, tableRows): TestCaseArrayCreationJSONPayload {
        let arrayParam: ArrayParameters[] = [];
        result.forEach((element, index) => {
            const value = (tableRows[index].querySelector("vscode-text-field") as TextField).value;
            const cmpValue = (tableRows[index].querySelector("vscode-dropdown") as Dropdown).currentValue;
            arrayParam.push({ comparevalue: cmpValue, inputvalue: value, name: element.name, outputvalue: element.ouputValueAsString });
        });
        const param: TestCaseArrayCreationJSONPayload = {
            parameter: {
                name: topElement.name,
                qualname: topElement.qualName,
                parameters: arrayParam
            }
        };
        return param;
    }

    private manageLoadFromDBContext(parentTextField: TextField, isinparam: boolean): void {
        const dbContext: Partial<FileFieldParams> = { isinparam };
        messageHandler.postMessage(iUnitCommands.LOAD_FROM_DB_VALUE, dbContext).then((result: LoadDbContext) => {
            if (result !== undefined) {
                parentTextField.type = 'text';
                if (result.fieldValue.value) {
                    parentTextField.value = result.fieldValue.value;
                }
            }
        });
    }



}



