// Custom JS for Elevator HMI binds and transitions
(function (TcHmi) {
    // Register for the HMI initialized event
    TcHmi.EventProvider.register('oninitialized', function () {
        console.log("Elevator HMI Initialized. Registering custom bindings...");

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
            var headerTime = document.getElementById('header_time');
            if (headerTime) {
                var now = new Date();
                headerTime.textContent = now.toLocaleDateString() + " " + now.toLocaleTimeString();
            }
        }, 1000);

        // Small delay to let TcHmi render all controls before subscribing
        setTimeout(function () {
            initializeCustomHmi();
        }, 500);

        function initializeCustomHmi() {
            console.log("Initializing custom HMI subscriptions...");

            // ============================================================
            // 2. Subscribe to Cabin Position -> Triggers visual vertical offset
            //    Server key: "ADS.PLC1.GVL_HMI.rfHmiCabinPosition"
            //    JS subscribe needs :: prefix for server symbols
            // ============================================================
            TcHmi.Symbol.subscribe('::ADS.PLC1.GVL_HMI.rfHmiCabinPosition', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    var pos = data.value; // 1.0 to 10.0
                    console.log("Cabin position update: " + pos);

                    // Shaft slot height layout:
                    // Floor 10 top = 0px, Floor 1 top = 423px
                    // Position 1 -> top 423, Position 10 -> top 0
                    var topPosition = 423 - ((pos - 1) / 9) * 423;

                    // Use both TcHmi API and direct DOM for maximum compatibility
                    var ctrl = TcHmi.Controls.get('hmi_cabin');
                    if (ctrl) {
                        ctrl.setTop(topPosition);
                    }

                    // Also set via direct DOM for CSS transition smoothness
                    var cabinEl = document.getElementById('hmi_cabin');
                    if (cabinEl) {
                        cabinEl.style.top = topPosition + 'px';
                    }

                    // Update telemetry position display
                    var telemetryPos = document.getElementById('telemetry_pos');
                    if (telemetryPos) {
                        // Position in meters (3.0m floor height)
                        var meters = (pos - 1) * 3.0;
                        telemetryPos.textContent = meters.toFixed(2) + " m";
                    }
                } else if (data.error !== TcHmi.Errors.NONE) {
                    console.error("Cabin position subscription error:", data.error);
                }
            });

            // ============================================================
            // 3. Subscribe to Door State -> Triggers door sliding transitions
            //    Server key: "ADS.PLC1.GVL_HMI.eHmiDoorState"
            // ============================================================
            var doorStateStrings = ["CLOSED", "OPENING", "OPEN", "CLOSING"];
            TcHmi.Symbol.subscribe('::ADS.PLC1.GVL_HMI.eHmiDoorState', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    var state = data.value;

                    // Update cabin door CSS classes
                    var ctrl = TcHmi.Controls.get('hmi_cabin');
                    if (ctrl) {
                        var classList = ['elevator-cabin'];
                        if (state === 0) classList.push('door-state-closed');
                        else if (state === 1) classList.push('door-state-opening');
                        else if (state === 2) classList.push('door-state-open');
                        else if (state === 3) classList.push('door-state-closing');
                        ctrl.setClassNames(classList);
                    }

                    // Update door status text
                    var telemetryDoor = document.getElementById('telemetry_door');
                    if (telemetryDoor) {
                        telemetryDoor.textContent = doorStateStrings[state] || "UNKNOWN";
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

                    // Load estimation display
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

            // ============================================================
            // 4. Subscribe to Current Floor -> Highlights active shaft block
            //    Server key: "ADS.PLC1.GVL_HMI.nHmiCurrentFloor"
            // ============================================================
            TcHmi.Symbol.subscribe('::ADS.PLC1.GVL_HMI.nHmiCurrentFloor', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    var currentFloor = data.value;
                    console.log("Current floor update: " + currentFloor);

                    // Highlight active floor block in the shaft
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

            // ============================================================
            // 5. Direction Indications & Speed display updates
            //    bHmiMovingUp: Server key "PLC1.GVL_HMI.bHmiMovingUp" (NO ADS. prefix!)
            //    bHmiMovingDown: Server key "ADS.PLC1.GVL_HMI.bHmiMovingDown" (HAS ADS. prefix)
            // ============================================================
            function updateDirectionDisplay() {
                var dirDisplay = document.getElementById('val_dir');
                var telemetrySpeed = document.getElementById('telemetry_speed');
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

            // bHmiMovingUp uses PLC1. prefix (no ADS.)
            TcHmi.Symbol.subscribe('::PLC1.GVL_HMI.bHmiMovingUp', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    isMovingUp = data.value;
                    updateDirectionDisplay();
                }
            });

            // bHmiMovingDown uses ADS.PLC1. prefix
            TcHmi.Symbol.subscribe('::ADS.PLC1.GVL_HMI.bHmiMovingDown', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    isMovingDown = data.value;
                    updateDirectionDisplay();
                }
            });

            // ============================================================
            // 6. SYSTEM COMMAND BUTTONS
            // ============================================================

            // Clear Calls Command
            // bFloorCallsOutside uses ADS.PLC1. prefix, 0-based indices [0..9]
            // bCabinCallsInside uses PLC1. prefix (no ADS.), 0-based indices [0..9]
            TcHmi.EventProvider.register('btn_clear_calls.onPressed', function () {
                for (var i = 0; i < 10; i++) {
                    TcHmi.Symbol.writeEx('::ADS.PLC1.GVL_HMI.bFloorCallsOutside[' + i + ']', false);
                    TcHmi.Symbol.writeEx('::PLC1.GVL_HMI.bCabinCallsInside[' + i + ']', false);
                }
            });

            // Subscribes to harness status to update local status labels
            // bRunTestCases: Server key "ADS.PLC1.MAIN.bRunTestCases"
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

            console.log("All custom HMI subscriptions registered successfully.");
        }
    });
})(TcHmi);
