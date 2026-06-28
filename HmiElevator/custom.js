// Custom JS for Elevator HMI binds and transitions
(function (TcHmi) {
    // Register for the HMI initialized event
    TcHmi.EventProvider.register('oninitialized', function () {
        console.log("Elevator HMI Initialized. Registering custom bindings...");

        // Dom element caches
        var telemetryPos = document.getElementById('telemetry_pos');
        var telemetryDoor = document.getElementById('telemetry_door');
        var telemetrySpeed = document.getElementById('telemetry_speed');
        var headerTime = document.getElementById('header_time');

        // Direction helper variables
        var isMovingUp = false;
        var isMovingDown = false;

        // Simulated door dwell countdown variables
        var doorTimerInterval = null;
        var doorTimerValue = 0.0;

        // Emergency status helper
        var isEmergency = false;

        // 1. Dynamic Header Clock
        setInterval(function () {
            if (headerTime) {
                var now = new Date();
                headerTime.textContent = now.toLocaleDateString() + " " + now.toLocaleTimeString();
            }
        }, 1000);

        initializeCustomHmi();

        function initializeCustomHmi() {
            telemetryPos = document.getElementById('telemetry_pos');
            telemetryDoor = document.getElementById('telemetry_door');
            telemetrySpeed = document.getElementById('telemetry_speed');
            headerTime = document.getElementById('header_time');

            // 2. Subscribe to Cabin Position (1.0 to 10.0) -> Triggers visual vertical offset
            TcHmi.Symbol.subscribe('::ADS.PLC1.GVL_HMI.rfHmiCabinPosition', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    var pos = data.value;
                    // Shaft height = 510px, Cabin height = 42px, travel range = 468px
                    // Floor 1 bottom topPosition is 423px
                    // Floor 10 top position is 0px
                    var topPosition = 423 - ((pos - 1) / 9) * 423;
                    var ctrl = TcHmi.Controls.get('hmi_cabin');
                    if (ctrl) {
                        ctrl.setTop(topPosition);
                    }
                    if (telemetryPos) {
                        // Position in meters (3.0m floor height)
                        var meters = (pos - 1) * 3.0;
                        telemetryPos.textContent = meters.toFixed(2) + " m";
                    }
                }
            });

            // 3. Subscribe to Door State -> Triggers door sliding transitions & simulated timers
            var doorStateStrings = ["CLOSED", "OPENING", "OPEN", "CLOSING"];
            TcHmi.Symbol.subscribe('::ADS.PLC1.GVL_HMI.eHmiDoorState', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    var state = data.value;
                    var ctrl = TcHmi.Controls.get('hmi_cabin');
                    if (ctrl) {
                        var classList = ['elevator-cabin'];
                        if (state === 0) classList.push('door-state-closed');
                        else if (state === 1) classList.push('door-state-opening');
                        else if (state === 2) classList.push('door-state-open');
                        else if (state === 3) classList.push('door-state-closing');
                        ctrl.setClassNames(classList);
                    }
                    if (telemetryDoor) {
                        telemetryDoor.textContent = doorStateStrings[state] || "UNKNOWN";
                        // Styling based on state
                        if (state === 0) telemetryDoor.style.color = "#10b981";
                        else if (state === 2) telemetryDoor.style.color = "#ef4444";
                        else telemetryDoor.style.color = "#ffb300";
                    }

                    // Simulated Door Timer countdown
                    if (state === 2) { // OPEN
                        doorTimerValue = 3.0;
                        if (doorTimerInterval) clearInterval(doorTimerInterval);
                        doorTimerInterval = setInterval(function () {
                            doorTimerValue -= 0.1;
                            if (doorTimerValue < 0) {
                                doorTimerValue = 0.0;
                                clearInterval(doorTimerInterval);
                            }
                            var timerDisplay = document.getElementById('telemetry_timer');
                            if (timerDisplay) {
                                timerDisplay.textContent = doorTimerValue.toFixed(1) + " s";
                            }
                        }, 100);
                    } else {
                        if (doorTimerInterval) {
                            clearInterval(doorTimerInterval);
                            doorTimerInterval = null;
                        }
                        var timerDisplay = document.getElementById('telemetry_timer');
                        if (timerDisplay) {
                            timerDisplay.textContent = "0.0 s";
                        }
                    }

                    // Load estimation (random passenger loads on open doors)
                    var loadDisplay = document.getElementById('telemetry_load');
                    if (loadDisplay) {
                        if (state === 2) {
                            loadDisplay.textContent = "380 kg";
                        } else if (state === 0) {
                            loadDisplay.textContent = "380 kg";
                        } else {
                            loadDisplay.textContent = "380 kg";
                        }
                    }
                }
            });

            // 4. Subscribe to Current Floor -> Highlights active floor block in shaft
            TcHmi.Symbol.subscribe('::ADS.PLC1.GVL_HMI.nHmiCurrentFloor', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    var currentFloor = data.value;
                    // Light up active floor block in the shaft
                    for (var i = 1; i <= 10; i++) {
                        var block = TcHmi.Controls.get('shaft_floor_' + i);
                        if (block) {
                            if (i === currentFloor) {
                                block.setClassNames(['shaft-floor-block', 'active-floor']);
                            } else {
                                block.setClassNames(['shaft-floor-block']);
                            }
                        }
                    }
                }
            });

            // 5. Direction Indications & Speed display updates
            function updateDirectionDisplay() {
                var dirDisplay = document.getElementById('val_dir');
                if (dirDisplay) {
                    if (isMovingUp) {
                        dirDisplay.textContent = "▲";
                        dirDisplay.style.color = "#3b82f6";
                        if (telemetrySpeed) telemetrySpeed.textContent = "0.75 m/s";
                    } else if (isMovingDown) {
                        dirDisplay.textContent = "▼";
                        dirDisplay.style.color = "#ef4444";
                        if (telemetrySpeed) telemetrySpeed.textContent = "0.75 m/s";
                    } else {
                        dirDisplay.textContent = "-";
                        dirDisplay.style.color = "#64748b";
                        if (telemetrySpeed) telemetrySpeed.textContent = "0.00 m/s";
                    }
                }
            }

            TcHmi.Symbol.subscribe('::PLC1.GVL_HMI.bHmiMovingUp', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    isMovingUp = data.value;
                    updateDirectionDisplay();
                }
            });

            TcHmi.Symbol.subscribe('::ADS.PLC1.GVL_HMI.bHmiMovingDown', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    isMovingDown = data.value;
                    updateDirectionDisplay();
                }
            });

            // 6. SYSTEM COMMAND BUTTONS

            // Clear Calls Command
            TcHmi.EventProvider.register('btn_clear_calls.onPressed', function () {
                for (var i = 0; i < 10; i++) {
                    TcHmi.Symbol.writeEx('::ADS.PLC1.GVL_HMI.bFloorCallsOutside[' + i + ']', false);
                    TcHmi.Symbol.writeEx('::PLC1.GVL_HMI.bCabinCallsInside[' + i + ']', false);
                }
            });

            // Subscribes to harness status to update local status labels
            TcHmi.Symbol.subscribe('::ADS.PLC1.MAIN.bRunTestCases', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    var runText = document.getElementById('test_status_text');
                    if (runText) {
                        if (data.value) {
                            runText.textContent = "Harness Status: Running Test Cases...";
                            runText.style.color = "#3b82f6";
                        } else {
                            runText.textContent = "Harness Status: Ready / Idle";
                            runText.style.color = "#10b981";
                        }
                    }
                }
            });

            // Simulated Emergency Stop Switch
            TcHmi.EventProvider.register('btn_emergency_stop.onPressed', function () {
                isEmergency = !isEmergency;
                var alarmText = document.getElementById('telemetry_alarms');
                var valAlarmStatus = document.getElementById('val_alarm_status');
                var indSysReady = document.getElementById('ind_sys_ready');
                var valSysStatus = document.getElementById('val_sys_status');

                if (isEmergency) {
                    if (alarmText) { alarmText.textContent = "EMERGENCY STOP INITIATED"; alarmText.style.color = "#ef4444"; }
                    if (valAlarmStatus) { valAlarmStatus.textContent = "ACTIVE ALARM"; valAlarmStatus.style.color = "#ef4444"; }
                    if (valSysStatus) { valSysStatus.textContent = "EMERGENCY ACTIVE"; valSysStatus.style.color = "#ef4444"; }
                    if (indSysReady) { indSysReady.style.color = "#ef4444"; indSysReady.textContent = "●"; }
                } else {
                    if (alarmText) { alarmText.textContent = "No Active Alarm"; alarmText.style.color = "#a8a29e"; }
                    if (valAlarmStatus) { valAlarmStatus.textContent = "NO ACTIVE ALARM"; valAlarmStatus.style.color = "#10b981"; }
                    if (valSysStatus) { valSysStatus.textContent = "NORMAL OPERATION"; valSysStatus.style.color = "#10b981"; }
                    if (indSysReady) { indSysReady.style.color = "#10b981"; indSysReady.textContent = "●"; }
                }
            });
        }
    });
})(TcHmi);
