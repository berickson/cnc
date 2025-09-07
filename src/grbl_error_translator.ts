// Comprehensive GRBL Error Code Translation
// Ported from cnc-serial.js for complete error handling

export interface ErrorInfo {
  desc: string;
  remedy: string;
}

export interface AlarmInfo {
  desc: string;
  remedy: string;
}

export class GrblErrorTranslator {
  private static readonly ERROR_CODES: { [key: number]: ErrorInfo } = {
    1: { desc: "G-code words consist of a letter and a value. Letter was not found", remedy: "Check G-code syntax" },
    2: { desc: "Numeric value format is not valid or missing an expected value", remedy: "Check number format" },
    3: { desc: "Grbl '$' system command was not recognized or supported", remedy: "Check command syntax" },
    4: { desc: "Negative value received for an expected positive value", remedy: "Use positive values only" },
    5: { desc: "Homing cycle is not enabled via settings", remedy: "Enable homing with $22=1" },
    6: { desc: "Minimum step pulse time must be greater than 3usec", remedy: "Increase step pulse time" },
    7: { desc: "EEPROM read failed. Reset and restored to default values", remedy: "Reset GRBL settings" },
    8: { desc: "Grbl '$' command cannot be used unless Grbl is IDLE", remedy: "Wait for IDLE state" },
    9: { desc: "G-code locked out during alarm or jog state", remedy: "Clear alarm or stop jog first" },
    10: { desc: "Soft limits cannot be enabled without homing also enabled", remedy: "Enable homing first" },
    11: { desc: "Max characters per line exceeded. Line was not processed and executed", remedy: "Shorten G-code lines" },
    12: { desc: "Grbl '$' setting value exceeds the maximum step rate supported", remedy: "Reduce step rate setting" },
    13: { desc: "Safety door detected as opened and door state initiated", remedy: "Close safety door" },
    14: { desc: "Build info or startup line exceeded EEPROM line length limit", remedy: "Shorten startup line" },
    15: { desc: "Jog target exceeds machine travel. Command ignored", remedy: "Reduce jog distance" },
    16: { desc: "Jog command with no '=' or contains prohibited g-code", remedy: "Fix jog command syntax" },
    17: { desc: "Laser mode requires PWM output", remedy: "Configure PWM for laser" },
    20: { desc: "Unsupported or invalid g-code command found in block", remedy: "Check G-code compatibility" },
    21: { desc: "More than one g-code command from same modal group found in block", remedy: "Use one command per group" },
    22: { desc: "Feed rate has not yet been set or is undefined", remedy: "Set feed rate with F command" },
    23: { desc: "G-code command in block requires an integer value", remedy: "Use integer values" },
    24: { desc: "Two G-code commands that both require the use of the XYZ axis words were detected in the block", remedy: "Separate axis commands" },
    25: { desc: "A G-code word was repeated in the block", remedy: "Remove duplicate words" },
    26: { desc: "A G-code command implicitly or explicitly requires XYZ axis words in the block, but none were detected", remedy: "Include axis coordinates" },
    27: { desc: "N line number value is not within the valid range of 1 - 9,999,999", remedy: "Use valid line numbers (1-9999999)" },
    28: { desc: "A G-code command was sent, but is missing some required P or L value words in the line", remedy: "Include required P or L values" },
    29: { desc: "Grbl supports six work coordinate systems G54-G59. G59.1, G59.2, and G59.3 are not supported", remedy: "Use G54-G59 only" },
    30: { desc: "The G53 G-code command requires either a G0 seek or G1 feed motion mode to be active. A different motion was active", remedy: "Use G0 or G1 with G53" },
    31: { desc: "There are unused axis words in the block and G80 motion mode cancel is active", remedy: "Remove unused axis words or use different motion mode" },
    32: { desc: "A G2 or G3 arc was commanded but there are no XYZ axis words in the selected plane to trace the arc", remedy: "Include axis words for arc plane" },
    33: { desc: "The motion command has an invalid target. G2, G3, and G38.2 generates this error, if the arc is impossible to generate or if the probe target is the current position", remedy: "Check arc parameters or probe target" },
    34: { desc: "A G2 or G3 arc, traced with the radius definition, had a mathematical error when computing the arc geometry", remedy: "Check arc radius and endpoints" },
    35: { desc: "A G2 or G3 arc, traced with the offset definition, is missing the IJK offset word in the selected plane to trace the arc", remedy: "Include IJK offset words" },
    36: { desc: "There are unused, leftover G-code words that aren't used by any command in the block", remedy: "Remove unused G-code words" },
    37: { desc: "The G43.1 dynamic tool length offset command cannot apply an offset to an axis other than its configured axis", remedy: "Use correct axis for tool length offset" },
    38: { desc: "Tool number greater than max supported value", remedy: "Use a valid tool number within supported range" }
  };

  private static readonly ALARM_CODES: { [key: number]: AlarmInfo } = {
    1: { desc: "Hard limit triggered. Machine position is likely lost due to sudden and immediate halt", remedy: "Re-homing is highly recommended" },
    2: { desc: "G-code motion target exceeds machine travel. Machine position safely retained", remedy: "Alarm may be unlocked" },
    3: { desc: "Reset while in motion. Grbl cannot guarantee position. Lost steps are likely", remedy: "Re-homing is highly recommended" },
    4: { desc: "Probe fail. The probe is not in the expected initial state before starting probe cycle", remedy: "Check probe connection and position" },
    5: { desc: "Probe fail. Probe did not contact the workpiece within the programmed travel", remedy: "Move probe closer to workpiece" },
    6: { desc: "Homing fail. Reset during active homing cycle", remedy: "Restart homing cycle" },
    7: { desc: "Homing fail. Safety door was opened during active homing cycle", remedy: "Close safety door and restart homing" },
    8: { desc: "Homing fail. Cycle failed to clear limit switch when pulling off", remedy: "Check pull-off setting and wiring" },
    9: { desc: "Hard limit triggered during motion. Machine position is likely lost", remedy: "Re-homing is highly recommended" },
    10: { desc: "Soft limit error. G-code motion target exceeds machine travel", remedy: "Check G-code and machine limits" }
  };

  private static readonly STATE_DESCRIPTIONS: { [key: string]: string } = {
    'Idle': 'Ready to receive commands',
    'Run': 'Executing G-code',
    'Hold:0': 'Hold complete, ready to resume',
    'Hold:1': 'Hold in progress, reset will throw alarm',
    'Hold': 'Feed hold active',
    'Jog': 'Jogging motion active',
    'Home': 'Homing cycle in progress',
    'Alarm': 'In alarm state - check alarm codes',
    'Check': 'Check mode active - G-code parsed but not executed',
    'Door:0': 'Door closed, ready to resume',
    'Door:1': 'Door open',
    'Door:2': 'Door closed and resuming',
    'Door:3': 'Door closed and hold complete',
    'Door': 'Safety door state active',
    'Sleep': 'Sleep mode active'
  };

  /**
   * Translate a GRBL error string to human-readable format
   */
  static translateError(errorString: string): string {
    // Extract error number from strings like "error:9" or "ALARM:1"
    const errorMatch = errorString.match(/error:(\d+)/i);
    const alarmMatch = errorString.match(/alarm:(\d+)/i);
    
    if (alarmMatch) {
      const alarmCode = parseInt(alarmMatch[1]);
      return this.translateAlarm(alarmCode, errorString);
    } else if (errorMatch) {
      const errorCode = parseInt(errorMatch[1]);
      return this.translateErrorCode(errorCode, errorString);
    }
    
    return errorString; // Return original if no match
  }

  /**
   * Translate a GRBL error code to human-readable format
   */
  static translateErrorCode(code: number, original: string = ""): string {
    const errorInfo = this.ERROR_CODES[code];
    if (errorInfo) {
      return `Error ${code}: ${errorInfo.desc} (${errorInfo.remedy})`;
    } else {
      return `Error ${code}: ${original} (Unknown error code)`;
    }
  }

  /**
   * Translate a GRBL alarm code to human-readable format
   */
  static translateAlarm(code: number, original: string = ""): string {
    const alarmInfo = this.ALARM_CODES[code];
    if (alarmInfo) {
      return `Alarm ${code}: ${alarmInfo.desc} (${alarmInfo.remedy})`;
    } else if (code === 0) {
      return `Alarm 0: Invalid alarm code - GRBL alarm codes are 1-10. Check for communication issues.`;
    } else {
      return `Alarm ${code}: ${original} (Unknown alarm code)`;
    }
  }

  /**
   * Get detailed error information
   */
  static getErrorInfo(code: number): ErrorInfo | null {
    return this.ERROR_CODES[code] || null;
  }

  /**
   * Get detailed alarm information
   */
  static getAlarmInfo(code: number): AlarmInfo | null {
    return this.ALARM_CODES[code] || null;
  }

  /**
   * Translate GRBL state with sub-codes to human-readable format
   */
  static translateState(statusCode: string): string {
    const description = this.STATE_DESCRIPTIONS[statusCode];
    if (description) {
      return `${statusCode} - ${description}`;
    }
    
    // Handle unknown sub-states by checking main state
    const mainState = statusCode.split(':')[0];
    const mainDescription = this.STATE_DESCRIPTIONS[mainState];
    if (mainDescription) {
      return `${statusCode} - ${mainDescription}`;
    }
    
    return statusCode; // Return original if no translation found
  }

  /**
   * Check if a string contains a GRBL error
   */
  static containsError(response: string): boolean {
    return /error:\d+/i.test(response) || /alarm:\d+/i.test(response);
  }

  /**
   * Extract all error codes from a response
   */
  static extractErrorCodes(response: string): { type: 'error' | 'alarm', code: number }[] {
    const errors: { type: 'error' | 'alarm', code: number }[] = [];
    
    const errorMatches = response.matchAll(/error:(\d+)/gi);
    for (const match of errorMatches) {
      errors.push({ type: 'error', code: parseInt(match[1]) });
    }
    
    const alarmMatches = response.matchAll(/alarm:(\d+)/gi);
    for (const match of alarmMatches) {
      errors.push({ type: 'alarm', code: parseInt(match[1]) });
    }
    
    return errors;
  }
}
