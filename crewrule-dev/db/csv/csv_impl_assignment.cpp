#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void assignmentParser::init(vector<string>& headers) {}


static vector<string> assignmentDefaultHeaders = { "id", "airline", "assignment", "description", "defaultAssignmentGroup", "label", "type",
"defaultLocation", "colorHex", "fixedDurationMin", "fixedStartTime", "fixedEndTime", "btPct", "creditPct", "fdpPct",
"dpPct", "isAdhoc", "isRecency", "isQualifier", "ftPct", "wpPct", "restTime", "divideCrewManday", "lastModified", "modifiedBy" };
vector<string>& assignmentParser::getDefaultHeaders() {
	return assignmentDefaultHeaders;
}

void* assignmentParser::createInstance() {
	return new ASSIGNMENT();
}

void assignmentParser::deleteInstance(void* obj) {
	delete (ASSIGNMENT*)obj;
}

string assignmentParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	ASSIGNMENT * ref = (ASSIGNMENT *)obj;
	//"", "", "", "", "", "", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->ASSIGNMENT_ID << "^"; }
		else if (headers[i] == "airline") { ss << ref->AIRLINE << "^"; }
		else if (headers[i] == "assignment") { ss << ref->assignment << "^"; }
		else if (headers[i] == "description") { ss << ref->DESCRIPTION << "^"; }
		else if (headers[i] == "label") { ss << ref->label << "^"; }
        else if (headers[i] == "defaultAssignmentGroup") { ss << ref->defaultAssignmentGroup << "^"; }
		else if (headers[i] == "type") { ss << ref->TYPE << "^"; }
		else if (headers[i] == "defaultLocation") { ss << "^"; }
		else if (headers[i] == "colorHex") { ss << ref->COLOR_HEX << "^"; }
		else if (headers[i] == "fixedDurationMin") { ss  << "^"; }
		else if (headers[i] == "fixedStartTime") { ss << ref->FIXED_STR_TM << "^"; }
		else if (headers[i] == "fixedEndTime") { ss << ref->FIXED_END_TM << "^"; }

		else if (headers[i] == "btPct") { ss << ref->BT_PCT << "^"; }
		else if (headers[i] == "creditPct") { ss << ref->CREDIT_PCT << "^"; }
		else if (headers[i] == "fdpPct") { ss << ref->FDP_PCT << "^"; }
		else if (headers[i] == "dpPct") { ss << ref->DP_PCT << "^"; }
		else if (headers[i] == "isAdhoc") { ss << "^"; }
		else if (headers[i] == "isRecency") { ss << "^"; }
		else if (headers[i] == "isQualifier") { ss << "^"; }
		else if (headers[i] == "fixedStrTm") { ss << "^"; }
		else if (headers[i] == "fixedEndTm") { ss << "^"; }
		else if (headers[i] == "displayLabelWhenAvailable") { ss << "^"; }

		else if (headers[i] == "defaultAssignmentGroup") { ss << "^"; }
		else if (headers[i] == "ftPct") { ss << ref->FT_PCT << "^"; }
		else if (headers[i] == "displayLabel") { ss << "^"; }
		else if (headers[i] == "patternCode") { ss << ref->PATTERN_CODE << "^"; }
		else if (headers[i] == "wpPct") { ss << ref->WP_PCT << "^"; }
		else if (headers[i] == "restTime") { ss << (ref->REST_TIME < 0 ? "" : std::to_string(ref->REST_TIME)) << "^"; }

		else if (headers[i] == "divideCrewManday") { ss << ref->divideCrewManday << "^"; }       //20180827 ain, OP#1395, new field 'liveId‘
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("assignment", headers[i]); }
	}
	return ss.str();
}

void assignmentParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	ASSIGNMENT * ref = (ASSIGNMENT *)obj;

	if (headers[index] == "id") { ref->ASSIGNMENT_ID = atoll(value); }
	else if (headers[index] == "airline") { ref->AIRLINE = value; }
	else if (headers[index] == "assignment") { ref->assignment = value; }
	else if (headers[index] == "description") { ref->DESCRIPTION = value; }
	else if (headers[index] == "label") { ref->label = value;}
    else if (headers[index] == "defaultAssignmentGroup") { ref->defaultAssignmentGroup = value; }
	else if (headers[index] == "type") { ref->TYPE = value; }
	else if (headers[index] == "defaultLocation") {  }
	else if (headers[index] == "colorHex") { ref->COLOR_HEX = value; }
	else if (headers[index] == "fixedDurationMin")  {}
	else if (headers[index] == "fixedStartTime") { ref->FIXED_STR_TM = value; }
	else if (headers[index] == "fixedEndTime") { ref->FIXED_END_TM = value; }

	else if (headers[index] == "btPct") { ref->BT_PCT = (float)atof(value) ; }
	else if (headers[index] == "creditPct") { ref->CREDIT_PCT = (float)atof(value); }
	else if (headers[index] == "fdpPct") { ref->FDP_PCT = (float)atof(value); }
	else if (headers[index] == "dpPct") { ref->DP_PCT = (float)atof(value);	}
	else if (headers[index] == "isAdhoc") { ; }
	else if (headers[index] == "isRecency") { ref->isRecency = (0 == strncmp(value, "true", 4)); } //20180802 ain, mantis#3708
	else if (headers[index] == "isQualifier") {}
	else if (headers[index] == "fixedStrTm") {}
	else if (headers[index] == "fixedEndTm") {}
	else if (headers[index] == "displayLabelWhenAvailable") {}

	else if (headers[index] == "standalone") {}
	else if (headers[index] == "defaultAssignmentGroup") {}
	else if (headers[index] == "ftPct") { ref->FT_PCT = (float)atof(value); }
	else if (headers[index] == "displayLabel") {}
	else if (headers[index] == "patternCode") { ref->PATTERN_CODE = value; }

	else if (headers[index] == "wpPct") { ref->WP_PCT = (float)atof(value); }
	else if (headers[index] == "restTime") { ref->REST_TIME = (value == NULL || strlen(value) == 0) ? -1 : atoi(value); }

	else if (headers[index] == "divideCrewManday") { ref->divideCrewManday = value; }              //20180827 ain, OP#1395, new field 'liveId‘
	else if (headers[index] == "recaLabel") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "orientation") {}
	else if (headers[index] == "pairingLabelColorHex") {}
	else if (headers[index] == "segmentLabelColorHex") {}
	else if (headers[index] == "dpGap") { ref->DP_GAP = atoi(value); }
	else if (headers[index] == "tmCreditFlag") { ref->tmCreditFlag = (isValueYesTrueOne(value) ? "Y" : ""); }
	else if (headers[index] == "assignmentUnitType") {}
	else if (headers[index] == "beforePctDpGapMin") { ref->before_pct_dp_gap = atoi(value); }
	else if (headers[index] == "afterPctDpGapMin") { ref->after_pct_dp_gap = atoi(value); }
	else { logUnkonwnField("assignment", headers[index]); }
}

