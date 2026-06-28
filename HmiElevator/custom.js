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
            // 2. Watch Cabin Position -> Triggers visual vertical offset
            //    Server key: "ADS.PLC1.GVL_HMI.rfHmiCabinPosition"
            // ============================================================
            TcHmi.Symbol.watch('%s%ADS.PLC1.GVL_HMI.rfHmiCabinPosition%/s%', function (data) {
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
                    var telemetryPosCtrl = TcHmi.Controls.get('telemetry_pos');
                    if (telemetryPosCtrl) {
                        // Position in meters (3.0m floor height)
                        var meters = (pos - 1) * 3.0;
                        telemetryPosCtrl.setText(meters.toFixed(2) + " m");
                    }
                } else if (data.error !== TcHmi.Errors.NONE) {
                    console.error("Cabin position watch error:", data.error);
                }
            });

            // ============================================================
            // 3. Watch Door State -> Triggers door sliding transitions
            //    Server key: "ADS.PLC1.GVL_HMI.eHmiDoorState"
            // ============================================================
            var doorStateStrings = ["CLOSED", "OPENING", "OPEN", "CLOSING"];
            
            function handleDoorStateChange(data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    var state = data.value;
                    console.log("eHmiDoorState value received:", state, "(" + (doorStateStrings[state] || "UNKNOWN") + ")");

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
                    var telemetryDoorCtrl = TcHmi.Controls.get('telemetry_door');
                    if (telemetryDoorCtrl) {
                        telemetryDoorCtrl.setText(doorStateStrings[state] || "UNKNOWN");
                    }
                } else if (data.error !== TcHmi.Errors.NONE) {
                    console.warn("eHmiDoorState watch warning:", data.error);
                }
            }

            // Watch using standard TcHmi.Symbol.watch API
            TcHmi.Symbol.watch('%s%ADS.PLC1.GVL_HMI.eHmiDoorState%/s%', handleDoorStateChange);
            TcHmi.Symbol.watch('%s%PLC1.GVL_HMI.eHmiDoorState%/s%', handleDoorStateChange);

            // ============================================================
            // 4. Subscribe to Current Floor -> Highlights active shaft block
            //    Server key: "ADS.PLC1.GVL_HMI.nHmiCurrentFloor"
            // ============================================================
            // 4. Watch Current Floor -> Highlights active shaft block
            //    Server key: "ADS.PLC1.GVL_HMI.nHmiCurrentFloor"
            // ============================================================
            TcHmi.Symbol.watch('%s%ADS.PLC1.GVL_HMI.nHmiCurrentFloor%/s%', function (data) {
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
                var dirSymbol = "-";
                var dirColor = "#64748b";

                if (isMovingUp) {
                    dirSymbol = "▲";
                    dirColor = "#3b82f6";
                } else if (isMovingDown) {
                    dirSymbol = "▼";
                    dirColor = "#ef4444";
                }

                // Update using framework API
                var dirCtrl = TcHmi.Controls.get('val_dir');
                if (dirCtrl) {
                    dirCtrl.setText(dirSymbol);
                    dirCtrl.setTextColor({ color: dirColor });
                }

                // Fallback to direct DOM for compatibility
                var dirDisplay = document.getElementById('val_dir');
                if (dirDisplay) {
                    dirDisplay.textContent = dirSymbol;
                    dirDisplay.style.color = dirColor;
                }
            }

            // Watch bHmiMovingUp
            TcHmi.Symbol.watch('%s%PLC1.GVL_HMI.bHmiMovingUp%/s%', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    isMovingUp = data.value;
                    updateDirectionDisplay();
                }
            });
            TcHmi.Symbol.watch('%s%ADS.PLC1.GVL_HMI.bHmiMovingUp%/s%', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    isMovingUp = data.value;
                    updateDirectionDisplay();
                }
            });

            // Watch bHmiMovingDown
            TcHmi.Symbol.watch('%s%ADS.PLC1.GVL_HMI.bHmiMovingDown%/s%', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    isMovingDown = data.value;
                    updateDirectionDisplay();
                }
            });
            TcHmi.Symbol.watch('%s%PLC1.GVL_HMI.bHmiMovingDown%/s%', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    isMovingDown = data.value;
                    updateDirectionDisplay();
                }
            });

            // ============================================================
            // 6. Watch Calls Arrays to dynamically style Button active states
            // ============================================================
            function updateHallCallButtons(callsArray) {
                if (Array.isArray(callsArray)) {
                    for (var i = 0; i < 10; i++) {
                        var btn = TcHmi.Controls.get('landing_btn_' + (i + 1));
                        if (btn) {
                            if (callsArray[i]) {
                                btn.setClassNames(['call-btn', 'active']);
                            } else {
                                btn.setClassNames(['call-btn']);
                            }
                        }
                    }
                }
            }

            function updateCarCallButtons(callsArray) {
                if (Array.isArray(callsArray)) {
                    for (var i = 0; i < 10; i++) {
                        var btn = TcHmi.Controls.get('keypad_btn_' + (i + 1));
                        if (btn) {
                            if (callsArray[i]) {
                                btn.setClassNames(['keypad-btn', 'active']);
                            } else {
                                btn.setClassNames(['keypad-btn']);
                            }
                        }
                    }
                }
            }

            // Watch Hall Calls GVL array
            TcHmi.Symbol.watch('%s%ADS.PLC1.GVL_HMI.bFloorCallsOutside%/s%', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    updateHallCallButtons(data.value);
                }
            });
            TcHmi.Symbol.watch('%s%PLC1.GVL_HMI.bFloorCallsOutside%/s%', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    updateHallCallButtons(data.value);
                }
            });

            // Watch Car Calls GVL array
            TcHmi.Symbol.watch('%s%PLC1.GVL_HMI.bCabinCallsInside%/s%', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    updateCarCallButtons(data.value);
                }
            });
            TcHmi.Symbol.watch('%s%ADS.PLC1.GVL_HMI.bCabinCallsInside%/s%', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    updateCarCallButtons(data.value);
                }
            });

            // ============================================================
            // 7. Register onClick events to write True to GVL call symbols
            // ============================================================
            for (var f = 1; f <= 10; f++) {
                (function (floorIndex) {
                    // Hall Calls
                    TcHmi.EventProvider.register('landing_btn_' + floorIndex + '.onPressed', function () {
                        console.log("HMI Hall Call pressed for floor: " + floorIndex);
                        TcHmi.Symbol.writeEx('::ADS.PLC1.GVL_HMI.bFloorCallsOutside[' + (floorIndex - 1) + ']', true);
                        TcHmi.Symbol.writeEx('::PLC1.GVL_HMI.bFloorCallsOutside[' + (floorIndex - 1) + ']', true);
                    });

                    // Car Calls
                    TcHmi.EventProvider.register('keypad_btn_' + floorIndex + '.onPressed', function () {
                        console.log("HMI Car Call pressed for floor: " + floorIndex);
                        TcHmi.Symbol.writeEx('::PLC1.GVL_HMI.bCabinCallsInside[' + (floorIndex - 1) + ']', true);
                        TcHmi.Symbol.writeEx('::ADS.PLC1.GVL_HMI.bCabinCallsInside[' + (floorIndex - 1) + ']', true);
                    });
                })(f);
            }

            // ============================================================
            // 8. SYSTEM COMMAND BUTTONS
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

            // Watch harness status to update local status labels
            TcHmi.Symbol.watch('%s%ADS.PLC1.MAIN.bRunTestCases%/s%', function (data) {
                if (data.error === TcHmi.Errors.NONE && data.value !== undefined) {
                    var textVal = data.value ? "Harness Status: Running Test Cases..." : "Harness Status: Ready / Idle";
                    var textColor = data.value ? "#3b82f6" : "#10b981";

                    var runTextCtrl = TcHmi.Controls.get('test_status_text');
                    if (runTextCtrl) {
                        runTextCtrl.setText(textVal);
                        runTextCtrl.setTextColor({ color: textColor });
                    }

                    var runText = document.getElementById('test_status_text');
                    if (runText) {
                        runText.textContent = textVal;
                        runText.style.color = textColor;
                    }
                }
            });



            console.log("All custom HMI subscriptions registered successfully.");
        }
    });
})(TcHmi);
