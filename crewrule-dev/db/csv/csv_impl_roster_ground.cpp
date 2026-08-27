#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
#include "Utility.h"

static vector<string> rosterGroundDefaultHeaders = { "id", "scenarioId", "crewId", "assignmentGroup", "assignment", "location", "strDtUtc", "endDtUtc", "isLocked", 
"groupId","tmProgramCourseId", "parentTmProgramCourseId", "role", "createdDt", "createBy", "remarks", "lastModified", "modifiedBy", "notificationTime",
"creditedMinutes","fmCreditedMinutes", "schCreditedMinutes", "schFmCreditedMinutes", "workingHour", "schWorkingHour","isAgreeWork","exceptionCode", "attributes"};
vector<string>& rosterGroundParser::getDefaultHeaders() {
	return rosterGroundDefaultHeaders;
}

void rosterGroundParser::init(vector<string>& headers) {}

void* rosterGroundParser::createInstance() {
	ROSTER * roster = new ROSTER();
	roster->pairId = 0;
	return roster;
}

void rosterGroundParser::deleteInstance(void* obj) {
	delete (ROSTER*)obj;
}

string rosterGroundParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	ROSTER * ref = (ROSTER *)obj;

	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->rosterId << "^"; }
		else if (headers[i] == "schId") { ss << ref->idscenario << "^"; }
		else if (headers[i] == "scenarioId") { ss << ref->idscenario << "^"; }
		else if (headers[i] == "pairingId") { ss << ref->pairId << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idcrew << "^"; }
		else if (headers[i] == "label") { ss << ref->label << "^"; } ///
		else if (headers[i] == "pairingDt") { ss << utcToUtcDtString(ref->pairingStartDt) << "^"; }///

		else if (headers[i] == "schStartDtUtc") { ss << utcToUtcTzString(ref->strUtc) << "^"; }///startDate
		else if (headers[i] == "schRestStrDtUtc") { ss << utcToUtcTzString(ref->restStrUtc) << "^"; }///restStartDt
		else if (headers[i] == "schEndDtUtc") { ss << utcToUtcTzString(ref->endUtc) << "^"; }///endDate
		else if (headers[i] == "actStartDtUtc") { ss << utcToUtcTzString(ref->actStrUtc) << "^"; }///actualStartDt
		else if (headers[i] == "actRestStrDtUtc") { ss << utcToUtcTzString(ref->actRestStrUtc) << "^"; }///actualRestStartDt
		else if (headers[i] == "actEndDtUtc") { ss << utcToUtcTzString(ref->actEndUtc) << "^"; }///actualEndDt

		else if (headers[i] == "schStartDtLocal") { ss << utcToUtcTzString(ref->strLoc) << "^"; }//mantis#2314, csv, roster.loc字段命名统一
		else if (headers[i] == "schRestStrDtLoc") { ss << utcToUtcTzString(ref->restStrLoc) << "^"; }///
		else if (headers[i] == "schEndDtLocal") { ss << utcToUtcTzString(ref->endLoc) << "^"; }///
		else if (headers[i] == "actStartDtLocal") { ss << utcToUtcTzString(ref->actStrLoc) << "^"; }///
		else if (headers[i] == "actRestStrDtLoc") { ss << utcToUtcTzString(ref->actRestStrLoc) << "^"; }///
		else if (headers[i] == "actEndDtLocal") { ss << utcToUtcTzString(ref->actEndLoc) << "^"; }///

		else if (headers[i] == "assignment") { ss << ref->qualifier << "^"; }///duty
		else if (headers[i] == "assignmentGroup") { ss << ref->duty << "^"; }///duty
		else if (headers[i] == "actingRank") { ss << ref->actingRank << "^"; }
		else if (headers[i] == "position") { ss << ref->position << "^"; }
		else if (headers[i] == "location") { ss << ref->location << "^"; }///
		else if (headers[i] == "preference") { ss << "^"; }
		else if (headers[i] == "source") { ss << ref->source << "^"; }

		else if (headers[i] == "appId") { ss << ref->appId << "^"; }
		else if (headers[i] == "calloutDt") { ss << ((ref->calloutUtc == 0 || ref->calloutUtc == -1) ? "" : utcToUtcDtString(ref->calloutUtc)) << "^"; }
		else if (headers[i] == "publishedDt") { ss << ((ref->publishedUtc == 0 || ref->publishedUtc == -1) ? "" : utcToUtcDtString(ref->publishedUtc)) << "^"; }
		else if (headers[i] == "qualifier") { ss << ref->qualifier << "^"; }///

		else if (headers[i] == "swapCrewId") { ss << "^"; }///
		else if (headers[i] == "training") { ss << ref->isTraining << "^"; }///isTraining
		else if (headers[i] == "comments") { ss << ref->comments << "^"; }
		else if (headers[i] == "isDeleted") { ss << (ref->isDelete == "Y" ? "true" : "false") << "^"; }///isDelete
		else if (headers[i] == "isRequested") { ss << (ref->isRequested ? "true" : "false") << "^"; }
		else if (headers[i] == "isLegal") { ss << (ref->_isLegal ? "true" : "false") << "^"; }///
		else if (headers[i] == "isPublished") { ss << ((ref->isPublished == "Y") ? "true" : "false") << "^"; }
		else if (headers[i] == "isAgreeWork") { ss << (ref->isAgreeWork ? "true" : "false") << "^"; }

		else if (headers[i] == "isSwapped") { ss << ((ref->isSwapped) ? "true" : "false") << "^"; }
		else if (headers[i] == "subRole") { ss << ref->subRole << "^"; }
		else if (headers[i] == "origin") { ss << ref->origin << "^"; }

		else if (headers[i] == "groupId") { ss << ref->tmGroupId << "^"; }
		else if (headers[i] == "tmProgramCourseId") { ss << ref->tmProgramCourseId << "^"; }
		else if (headers[i] == "parentTmProgramCourseId") { ss << ref->tmParentProgramCourseId << "^"; }
		else if (headers[i] == "resourceCode") { ss << ref->tmResourceCode << "^"; }
		else if (headers[i] == "role") { ss << ref->tmRole << "^"; }
		
		else if (headers[i] == "creditedMinutes") { ss << Utility::round(ref->creditMinutes, 2) << "^"; }
		else if (headers[i] == "fmCreditedMinutes") { ss << Utility::round(ref->fmCreditMinutes, 2) << "^"; }
		else if (headers[i] == "workingHour") { ss << Utility::round(ref->workingHour, 2) << "^"; }

		else if (headers[i] == "schCreditedMinutes") { ss << Utility::round(ref->schCreditMinutes, 2) << "^"; }
		else if (headers[i] == "schFmCreditedMinutes") { ss << Utility::round(ref->schFmCreditMinutes, 2) << "^"; }
		else if (headers[i] == "schWorkingHour") { ss << Utility::round(ref->schWorkingHour, 2) << "^"; }

		else if (headers[i] == "modifiedBy") { ss << ref->idUser << "^"; }
		else if (headers[i] == "lastModified") { ss << ref->tmst << "^"; }
		else if (headers[i] == "createdBy") { ss << "^"; }
		else if (headers[i] == "createdDt") { ss << "^"; }
		else if (headers[i] == "ver") { ss << ref->ver << "^"; }
		else if (headers[i] == "seqOrder") { ss << ref->seqOrder << "^"; }
		else if (headers[i] == "interfaceId") { ss << "^"; }
		else if (headers[i] == "exceptionCode") { ss << ref->exceptionCode << "^"; }
		else if (headers[i] == "attributes") { ss << ref->attribute << "^"; }
		else { logUnkonwnField("roster_ground", headers[i]); }
	}
	return ss.str();
}

void rosterGroundParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	ROSTER * ref = (ROSTER *)obj;

	if (headers[index] == "id") { ref->rosterId = atoll(value); }
	else if (headers[index] == "scenarioId") { ref->idscenario = atoll(value); }
	else if (headers[index] == "crewId") { ref->idcrew = value; }
	else if (headers[index] == "assignmentGroup") { ref->duty = value; }
	else if (headers[index] == "assignment") { ref->qualifier = value; }
	else if (headers[index] == "location") { ref->location = value; } ///
	
	else if (headers[index] == "strDtUtc") { 
		ref->strUtc = utcStrToUtc(value);
		ref->actStrUtc = utcStrToUtc(value);
	}///
	else if (headers[index] == "endDtUtc") { 
		ref->restStrUtc = utcStrToUtc(value); 
		ref->actRestStrUtc = utcStrToUtc(value);
	}
	else if (headers[index] == "isLocked") { }
	else if (headers[index] == "restEndDtUtc") {
		ref->actEndUtc = utcStrToUtc(value);
		ref->endUtc = utcStrToUtc(value);
	}
	else if (headers[index] == "source") { ref->source = value; }
	else if (headers[index] == "isVolunteer") {  }
	else if (headers[index] == "comments") {  }
	else if (headers[index] == "createdDt") {  }
	else if (headers[index] == "createBy") {  }
	else if (headers[index] == "remarks") {  }
	else if (headers[index] == "isRequested") { ref->isRequested = (atoi(value) == 1); }
	else if (headers[index] == "sendFlag") {}
	else if (headers[index] == "isSwapped") {}
	else if (headers[index] == "label") { ref->label = value;}
	else if (headers[index] == "division") {}

	else if (headers[index] == "groupId") { ref->tmGroupId = value; }
	else if (headers[index] == "tmProgramCourseId") { ref->tmProgramCourseId = atoll(value); }
	else if (headers[index] == "resourceCode") { ref->tmResourceCode = value; }
	else if (headers[index] == "role") { ref->tmRole = value; }

	else if (headers[index] == "lastModified") {  }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "createdBy") {}
	else if (headers[index] == "requestId") {}
	else if (headers[index] == "tagSet") {}
	else if (headers[index] == "autoLabel") {}
	else if (headers[index] == "isPush") {}
	else if (headers[index] == "parentTmProgramCourseId" && (value != NULL && strlen(value) != 0)) { ref->tmParentProgramCourseId = stoll(value); }
	else if (headers[index] == "transactionId") {}
	else if (headers[index] == "notificationTime") { ref->notificationTime = utcStrToUtc(value); }
	else if (headers[index] == "isExtraCourse") {}
	else if (headers[index] == "actionDtUtc") {}
	else if (headers[index] == "notificationRemark") {}
	else if (headers[index] == "callOutRosterId") {}
	else if (headers[index] == "courseCode") {}
	else if (headers[index] == "subRole") {}
	else if (headers[index] == "subGroupId") {}
	else if (headers[index] == "subTmProgramCourseId") {}
	else if (headers[index] == "subParentTmProgramCourseId") {}
	else if (headers[index] == "subCourseCode") {}

	else if (headers[index] == "creditedMinutes") { ref->creditMinutes = atof(value); }
	else if (headers[index] == "fmCreditedMinutes") { ref->fmCreditMinutes = atof(value); }
	else if (headers[index] == "workingHour") { ref->workingHour = atof(value); }

	else if (headers[index] == "schCreditedMinutes") { ref->schCreditMinutes = atof(value); }
	else if (headers[index] == "schFmCreditedMinutes") { ref->schFmCreditMinutes = atof(value); }
	else if (headers[index] == "schWorkingHour") { ref->schWorkingHour = atof(value); }
	else if (headers[index] == "dpMinutes") { ref->dpMinutes = atoi(value); }
	else if (headers[index] == "dpMin") {}
	else if (headers[index] == "requestSource") {}
	else if (headers[index] == "isPublish") {}
	else if (headers[index] == "attributes") { ref->attribute = value; }
	else if (headers[index] == "isAgreeWork") { ref->isAgreeWork = (0 == strncmp(value, "true", 4)); }
	else if (headers[index] == "exceptionCode") {
		ref->exceptionCode = value;
		if (!ref->exceptionCode.empty()) {
			split(ref->exceptionCode.c_str(), '|', ref->exceptionCodes);
		}
	}
	else { logUnkonwnField("roster_ground", headers[index]); }
}

