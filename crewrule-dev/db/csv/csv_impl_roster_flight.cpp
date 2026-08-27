#include <sstream>
#include "../RosterFlight.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
#include "Utility.h"

void rosterFlightParser::init(vector<string>& headers) {}


static vector<string> rosterFlightDefaultHeaders = { "fltId", "pairingId", "dutyId", "crewId", "rosterId", "fltDt", "division",
"actingRank", "activeRank", "seqOrder", "checkType", "tsFlag", "source", "pickupDtLoc", "firstBriefDtLoc", "secondBriefDtLoc",
"debriefDtLoc", "dropoffDtLoc", "assignment", "id", "scenarioId", "groupId","tmProgramCourseId", "tmProgramCourseId", "role", 
"createdBy", "createdDt", "modifiedBy", "lastModified","position", "parentTmProgramCourseId","isExtraCourse","subTmProgramCourseId","subCourseCode","subParentTmProgramCourseId", 
"seqOrderSource", "sendFlag", "tagSet", "courseCode", "pairingStartUtc", "creditedMinutes", "fmCreditedMinutes", "schCreditedMinutes", "schFmCreditedMinutes","accState","accTimezone", "isAgreeWork","exceptionCode", "resourceCode" };

vector<string>& rosterFlightParser::getDefaultHeaders() {
	return rosterFlightDefaultHeaders;
}

void* rosterFlightParser::createInstance() {
	return new RosterFlight();
}

void rosterFlightParser::deleteInstance(void* obj) {
	delete (RosterFlight*)obj;
}

string rosterFlightParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	RosterFlight * ref = (RosterFlight *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "fltId") { ss << ref->fltId << "^"; }
		else if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "schId") { ss << ref->scenarioId << "^"; }
		else if (headers[i] == "scenarioId") { ss << ref->scenarioId << "^"; }
		else if (headers[i] == "pairingId") { ss << ref->pairingId << "^"; }
		else if (headers[i] == "dutyId") { ss << ref->dutyId << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "rosterId") { ss << ref->rosterId<< "^"; }
		else if (headers[i] == "fltDt") { ss << ref->fltDt << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "actingRank") { ss << ref->actingRank << "^"; }
		else if (headers[i] == "activeRank") { ss << ref->activeRank << "^"; }
		else if (headers[i] == "seqOrder") { ss << ref->seqOrder << "^"; }
		else if (headers[i] == "checkType") { ss << ref->checkType << "^"; }
		else if (headers[i] == "tsFlag") { ss << ref->tsFlag << "^"; }
		else if (headers[i] == "source") { ss << ref->source << "^"; }
		else if (headers[i] == "pickupDtLoc") { ss << utcToUtcTzString(ref->pickupDtLoc) << "^"; } //20201127 ain, mantis#9032, java server期待解析LocalDateTime格式带T, 如1970-1-1T00:00:00
		else if (headers[i] == "firstBriefDtLoc") { ss << utcToUtcTzString(ref->firstBriefDtLoc) << "^"; }
		else if (headers[i] == "secondBriefDtLoc") { ss << utcToUtcTzString(ref->secondBriefDtLoc) << "^"; }
		else if (headers[i] == "debriefDtLoc") { ss << utcToUtcTzString(ref->debriefDtLoc) << "^"; }
		else if (headers[i] == "dropoffDtLoc") { ss << utcToUtcTzString(ref->dropoffDtLoc) << "^"; }
		else if (headers[i] == "assignment") { ss << ref->assignment << "^"; }

		else if (headers[i] == "groupId") { ss << ref->tmGroupId << "^"; }
		else if (headers[i] == "tmProgramCourseId") {
			// Java端要求默认给空值
			if (ref->tmProgramCourseId != 0) ss << ref->tmProgramCourseId;
			ss << "^";
		}
		else if (headers[i] == "parentTmProgramCourseId") {
			// Java端要求默认给空值
			if (ref->parentTmProgramCourseId != 0) ss << ref->parentTmProgramCourseId;
			ss << "^";
		}
		else if (headers[i] == "resourceCode") { ss << ref->tmResourceCode << "^"; }
		else if (headers[i] == "role") { ss << ref->tmRole << "^"; }

		else if (headers[i] == "isExtraCourse") { ss << (ref->isExtraCourse ? "1" : "0") << "^"; }
		else if (headers[i] == "subTmProgramCourseId") {
			// Java端要求默认给空值
			if (ref->subTmProgramCourseId != 0)
				ss << ref->subTmProgramCourseId;
			ss << "^";
		}
		else if (headers[i] == "subCourseCode") { ss << ref->subCourseCode << "^"; }
		else if (headers[i] == "subParentTmProgramCourseId") {
			// Java端要求默认给空值
			if (ref->subParentTmProgramCourseId != 0)
				ss << ref->subParentTmProgramCourseId;
			ss << "^";
		}

		else if (headers[i] == "seqOrderSource") { ss << ref->seqOrderSource << "^"; }
		else if (headers[i] == "sendFlag") { ss << "^"; }
		else if (headers[i] == "tagSet") { ss << ref->tagSet << "^"; }
		else if (headers[i] == "courseCode") { ss << ref->courseCode << "^"; }
		else if (headers[i] == "pairingStartUtc") { ss << utcToUtcTzString(ref->pairingStartUtc) << "^"; }

		else if (headers[i] == "creditedMinutes") { ss << Utility::round(ref->creditedInSec / 60.0, 2) << "^"; }
		else if (headers[i] == "fmCreditedMinutes") { ss << Utility::round(ref->fmCreditedInSec / 60.0, 2) << "^"; }
		else if (headers[i] == "schCreditedMinutes") { ss << Utility::round(ref->schCreditedInSec / 60.0, 2) << "^"; }
		else if (headers[i] == "schFmCreditedMinutes") { ss << Utility::round(ref->schFmCreditedInSec / 60.0, 2) << "^"; }

		else if (headers[i] == "createdBy") { ss << "^"; }
		else if (headers[i] == "createdDt") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "position") { ss << ref->position << "^"; }
		else if (headers[i] == "accState") { ss << ref->accState << "^"; }
		else if (headers[i] == "accTimezone") { ss << ref->accTimezone << "^"; }
		else if (headers[i] == "isAgreeWork") { ss << (ref->isAgreeWork ? "true" : "false") << "^"; }
		else if (headers[i] == "exceptionCode") { ss << ref->exceptionCode << "^"; }
		else { logUnkonwnField("roster_flight", headers[i]); }
	}
	return ss.str();
}

void rosterFlightParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	RosterFlight * ref = (RosterFlight *)obj;
	if (headers[index] == "fltId") { ref->fltId = atoll(value); }
	else if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "schId") { ref->scenarioId = atoll(value); }
	else if (headers[index] == "scenarioId") { ref->scenarioId = atoll(value); }
	else if (headers[index] == "pairingId") { ref->pairingId = atoll(value); }
	else if (headers[index] == "dutyId") { ref->dutyId = atoll(value); }
	else if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "rosterId") { ref->rosterId = atoll(value); }
	else if (headers[index] == "fltDt") { ref->fltDt = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "actingRank") { ref->actingRank = value; }
	else if (headers[index] == "activeRank") { ref->activeRank = value; }
	else if (headers[index] == "seqOrder") { ref->seqOrder = atoi(value); }
	else if (headers[index] == "checkType") { ref->checkType = value; }
	else if (headers[index] == "tsFlag") { ref->tsFlag = value; split(ref->tsFlag.c_str(), '|', ref->tsFlags); }
	else if (headers[index] == "source") { ref->source = value; }
	else if (headers[index] == "pickupDtLoc") { ref->pickupDtLoc = utcStrToUtc(value); }
	else if (headers[index] == "firstBriefDtLoc") { ref->firstBriefDtLoc = utcStrToUtc(value); }
	else if (headers[index] == "secondBriefDtLoc") { ref->secondBriefDtLoc = utcStrToUtc(value); }
	else if (headers[index] == "debriefDtLoc") { ref->debriefDtLoc = utcStrToUtc(value); }
	else if (headers[index] == "dropoffDtLoc") { ref->dropoffDtLoc = utcStrToUtc(value); }
	else if (headers[index] == "assignment") { ref->assignment = value; }

	else if (headers[index] == "groupId") { ref->tmGroupId = value; }
	else if (headers[index] == "tmProgramCourseId") { ref->tmProgramCourseId = atoll(value); }
	else if (headers[index] == "parentTmProgramCourseId") { ref->parentTmProgramCourseId = atoll(value); }
	else if (headers[index] == "resourceCode") { ref->tmResourceCode = value; }
	else if (headers[index] == "role") { ref->tmRole = value; }

	else if (headers[index] == "createdBy") { /*ref->createdBy = value;*/ }
	else if (headers[index] == "createdDt") { /*ref->createdDt = utcStrToUtc(value);*/ }
	else if (headers[index] == "lastModified") { /*ref->lastModified = utcStrToUtc(value);*/ }
	else if (headers[index] == "modifiedBy") { /*ref->modifiedBy = value;*/ }

	else if (headers[index] == "position") { ref->position = value; }
	else if (headers[index] == "sendFlag") {  }
	else if (headers[index] == "tagSet") { ref->tagSet = value; }
	else if (headers[index] == "pairingStartUtc") { ref->pairingStartUtc = utcStrToUtc(value); }
	else if (headers[index] == "seqOrderSource") { ref->seqOrderSource = value; }
	else if (headers[index] == "courseCode") { ref->courseCode = value; }
	
	else if (headers[index] == "isExtraCourse") { ref->isExtraCourse = (atoi(value) == 1); }
	else if (headers[index] == "subTmProgramCourseId") { ref->subTmProgramCourseId = atoll(value); }
	else if (headers[index] == "subCourseCode") { ref->subCourseCode = value; }
	else if (headers[index] == "subParentTmProgramCourseId") { ref->subParentTmProgramCourseId = atoll(value); }

	else if (headers[index] == "actionDtUtc") {}
	else if (headers[index] == "subRole") { ref->tmSubRole = value; }
	else if (headers[index] == "subGroupId") {}

	else if (headers[index] == "creditedMinutes") { ref->creditedInSec = (int)(atof(value) * 60); }//Credit Hour(实际时间)
	else if (headers[index] == "fmCreditedMinutes") { ref->fmCreditedInSec = (int)(atof(value) * 60); }//首月Credit Hour(实际时间)
	else if (headers[index] == "schCreditedMinutes") { ref->schCreditedInSec = (int)(atof(value) * 60); }//Credit Hour(计划时间)
	else if (headers[index] == "schFmCreditedMinutes") { ref->schFmCreditedInSec = (int)(atof(value) * 60); }//首月Credit Hour(计划时间)
	
	else if (headers[index] == "accState") { ref->accState = value; }
	else if (headers[index] == "accTimezone") { ref->accTimezone = atoi(value); }

	else if (headers[index] == "requestSource") {}
	else if (headers[index] == "requestId") {}
	else if (headers[index] == "isPublish") {}
	else if (headers[index] == "isAgreeWork") { ref->isAgreeWork = (0 == strncmp(value, "true", 4)); }
	else if (headers[index] == "exceptionCode") {
		ref->exceptionCode = value;
		if (!ref->exceptionCode.empty()) {
			split(ref->exceptionCode.c_str(), '|', ref->exceptionCodes);
		}
	}
	else { logUnkonwnField("roster_flight", headers[index]); }
}

