#include <sstream>
#include <algorithm>
#include <memory.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../CrewDB.h"
#include "csv_impl.h"

static bool _g_isForV2 = true;
static bool _g_isForV2_done = false;

static bool _isForV2(vector<string>& headers) {
	if (!_g_isForV2_done) {
		_g_isForV2 = find(headers.begin(), headers.end(), "assignmentGroup") == headers.end();
		_g_isForV2_done = true;
	}
	return _g_isForV2;
}

static vector<string> rosterDefaultHeaders = { "id", "scenarioId", "pairingId", "crewId", "label", "pairingDt", "schRestStrDtUtc", "schRestStrDtLoc", "actRestStrDtUtc", "actRestStrDtLoc",	"assignment", "assignmentGroup",
	"actingRank", "position", "location", "preference", "source", "origin", "appId", "calloutDt", "publishedDt", "role", "groupId", "resourceCode", "tmProgramCourseId", "parentTmProgramCourseId", "qualifier", "swapCrewId", "training", "comments", "isDeleted", "isRequested", "isLegal",
	"isPublished", "isSwapped", "subRole", "schStartDtUtc", "schEndDtUtc", "schStartDtLocal", "schEndDtLocal", "actStartDtUtc",	"actEndDtUtc", "actStartDtLocal", "actEndDtLocal", "ver", "seqOrder", "memo", 
	"perDiemMins", "lhPerDiemMins", "fmPerDiemMins", "fmLhPerDiemMins", "creditedMinutes", "isCallOut", "callOutRosterId", "notificationTime", "notificationRemark",
	"fmCreditedMinutes", "schCreditedMinutes", "schFmCreditedMinutes", "schPerDiemMins", "schLhPerDiemMins", "schFmPerDiemMins", "schFmLhPerDiemMins", "workingHour", "schWorkingHour", "minRest", "maxFdpMin"};
vector<string>& rosterParser::getDefaultHeaders() {
	return rosterDefaultHeaders;
}

void rosterParser::init(vector<string>& headers) {}

void* rosterParser::createInstance() {
	return new ROSTER();
}

void rosterParser::deleteInstance(void* obj) {
	delete (ROSTER*)obj;
}

string rosterParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	ROSTER * ref = (ROSTER *)obj;

	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->rosterId << "^"; }
		else if (headers[i] == "schId") { ss << ref->idscenario << "^"; }
		else if (headers[i] == "scenarioId") { ss << ref->idscenario << "^"; }
		else if (headers[i] == "pairingId") { ss << ref->pairId << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idcrew << "^"; }
		else if (headers[i] == "label") { ss << ref->label << "^"; } ///
		else if (headers[i] == "pairingDt") { ss << utcToUtcDtString(ref->pairingStartDt) <<  "^"; }///

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
		else if (headers[i] == "preference") { ss << ref->preference <<"^"; }
		else if (headers[i] == "source") { ss << ref->source << "^"; }

		else if (headers[i] == "appId") { ss << ref->appId << "^"; }
		else if (headers[i] == "calloutDt" || headers[i] == "callOutDtUtc") { ss << ((ref->calloutUtc == 0 || ref->calloutUtc == -1)? "" : utcToUtcDtString(ref->calloutUtc)) << "^"; }
		else if (headers[i] == "publishedDt") { ss << ((ref->publishedUtc == 0 || ref->publishedUtc == -1) ? "" : utcToUtcDtString(ref->publishedUtc)) << "^"; }
		else if (headers[i] == "role") { ss << ref->tmRole << "^"; }
        else if (headers[i] == "groupId") { ss << ref->tmGroupId << "^"; }
		else if (headers[i] == "resourceCode") { ss << ref->tmResourceCode << "^"; }
		// Java端要求默认给空值
		else if (headers[i] == "tmProgramCourseId") {
			if (ref->tmProgramCourseId != 0) ss << ref->tmProgramCourseId;
			ss << "^";
		} else if (headers[i] == "parentTmProgramCourseId") {
			if (ref->tmParentProgramCourseId != 0) ss << ref->tmParentProgramCourseId;
			ss << "^";
		}
		else if (headers[i] == "qualifier") { ss << ref->qualifier << "^"; }///

		else if (headers[i] == "swapCrewId") { ss << "^"; }///
		else if (headers[i] == "training") { ss << ref->isTraining << "^"; }///isTraining
		else if (headers[i] == "comments") { ss << ref->comments << "^"; }
		else if (headers[i] == "isDeleted") { ss << (ref->isDelete == "Y" ? "true" : "false") << "^"; }///isDelete
		else if (headers[i] == "isRequested") { ss << (ref->isRequested ? "true" : "false") << "^"; }
		else if (headers[i] == "isLegal") { ss << (ref->_isLegal ? "true" : "false") << "^"; }///
		else if (headers[i] == "isPublished") { ss << ((ref->isPublished == "Y") ? "true" : "false") << "^"; }

		else if (headers[i] == "isSwapped") { ss << ((ref->isSwapped) ? "true" : "false") << "^"; }
		else if (headers[i] == "subRole") { ss << ref->subRole << "^"; }
		else if (headers[i] == "origin") { ss << ref->origin << "^"; }
		else if (headers[i] == "modifiedBy") { ss << ref->idUser << "^"; }
		else if (headers[i] == "lastModified") { ss << ref->tmst << "^"; }//输出time_t类型？
		else if (headers[i] == "createdBy") { ss << ref->createdBy << "^"; }
		else if (headers[i] == "createdDt") { ss << utcToUtcTzString(ref->createdDt) << "^"; }
		else if (headers[i] == "ver") { ss << ref->ver << "^"; }
		else if (headers[i] == "seqOrder") { ss << ref->seqOrder << "^"; }
		else if (headers[i] == "memo") { ss << ref->memo << "^"; }
		else if (headers[i] == "interfaceId") { ss << "^"; }
		else if (headers[i] == "score") { ss << ref->score <<"^"; } //"", "", "", "", "", "", "") 

		else if (headers[i] == "perDiemMins") { ss << Utility::round(ref->perDiemMins, 2) << "^"; }
		else if (headers[i] == "lhPerDiemMins") { ss << Utility::round(ref->lhPerDiemMins, 2) << "^"; }
		else if (headers[i] == "fmPerDiemMins") { ss << Utility::round(ref->fmPerDiemMins, 2) << "^"; }
		else if (headers[i] == "fmLhPerDiemMins") { ss << Utility::round(ref->fmLhPerDiemMins, 2) << "^"; }
		else if (headers[i] == "creditedMinutes") { ss << Utility::round(ref->creditMinutes, 2) << "^"; }
		else if (headers[i] == "fmCreditedMinutes") { ss << Utility::round(ref->fmCreditMinutes, 2) << "^"; }
		else if (headers[i] == "workingHour") { ss << Utility::round(ref->workingHour, 2) << "^"; }

		else if (headers[i] == "schCreditedMinutes") { ss << Utility::round(ref->schCreditMinutes, 2) << "^"; }
		else if (headers[i] == "schFmCreditedMinutes") { ss << Utility::round(ref->schFmCreditMinutes, 2) << "^"; }
		else if (headers[i] == "schPerDiemMins") { ss << Utility::round(ref->schPerDiemMins, 2) << "^"; }
		else if (headers[i] == "schLhPerDiemMins") { ss << Utility::round(ref->schLhPerDiemMins, 2) << "^"; }
		else if (headers[i] == "schFmPerDiemMins") { ss << Utility::round(ref->schFmPerDiemMins, 2) << "^"; }
		else if (headers[i] == "schFmLhPerDiemMins") { ss << Utility::round(ref->schFmLhPerDiemMins, 2) << "^"; }
		else if (headers[i] == "schWorkingHour") { ss << Utility::round(ref->schWorkingHour, 2) << "^"; }
		///
		else if (headers[i] == "isCallOut") { ss << (ref->isCallOut ? "true" : "false") << "^"; }
        else if (headers[i] == "callOutRosterId") {
            if (ref->callOutRosterId > 0) ss << ref->callOutRosterId;
            ss << "^"; }
		else if (headers[i] == "notificationTime") { ss << ((ref->notificationTime == 0 || ref->notificationTime == -1) ? "" : utcToUtcTzString(ref->notificationTime)) << "^"; }
		else if (headers[i] == "notificationRemark") { ss << ref->notificationRemark << "^"; }
		else if (headers[i] == "minRest") {
			stringstream ssMinRest;
			if (ref->pairing != nullptr) {
				for (size_t i = 0; i < ref->pairing->getNumDuties(); i++) {
					ssMinRest << ref->dutyValues.getMinRest(i);
					if ((i + 1) != ref->pairing->getNumDuties()) {
						ssMinRest << "|";
					}
				}
			}
			ss << ssMinRest.str() << "^";
		}
		else if (headers[i] == "maxFdpMin") { 
			stringstream ssMaxFdp;
			if (ref->pairing != nullptr) {
				for (size_t i = 0; i < ref->pairing->getNumDuties(); i++) {
					ssMaxFdp << ref->dutyValues.getMaxFdp(i);
					if ((i + 1) != ref->pairing->getNumDuties()) {
						ssMaxFdp << "|";
					}
				}
			}
			ss << ssMaxFdp.str() << "^";
		}
		else { logUnkonwnField("roster", headers[i]); }
	}
	return ss.str();
}

void rosterParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	ROSTER * ref = (ROSTER *)obj;

	if (headers[index] == "id") { ref->rosterId = atoll(value); }
	else if (headers[index] == "schId") { ref->idscenario = atoll(value); }
	else if (headers[index] == "scenarioId") { ref->idscenario = atoll(value); }
	else if (headers[index] == "pairingId") { ref->pairId = atoll(value); }
	else if (headers[index] == "crewId") { ref->idcrew = value; }
	else if (headers[index] == "label") { ref->label = value; } ///
	else if (headers[index] == "pairingDt") { ref->pairingStartDt = utcStrToUtc(value); }///

	else if (headers[index] == "schStartDtUtc") { ref->strUtc = utcStrToUtc(value); }
	else if (headers[index] == "schRestStrDtUtc") { ref->restStrUtc = utcStrToUtc(value); }
	else if (headers[index] == "schEndDtUtc") { ref->endUtc = utcStrToUtc(value); }
	else if (headers[index] == "actStartDtUtc") { ref->actStrUtc = utcStrToUtc(value); }
	else if (headers[index] == "actRestStrDtUtc") { ref->actRestStrUtc = utcStrToUtc(value); }
	else if (headers[index] == "actEndDtUtc") { ref->actEndUtc = utcStrToUtc(value); }

	else if (headers[index] == "schStartDtLocal") { ref->strLoc = utcStrToUtc(value); }///
	else if (headers[index] == "schRestStrDtLoc") { ref->restStrLoc = utcStrToUtc(value); }///
	else if (headers[index] == "schEndDtLocal") { ref->endLoc = utcStrToUtc(value); }///
	else if (headers[index] == "actStartDtLocal") { ref->actStrLoc = utcStrToUtc(value); }///
	else if (headers[index] == "actRestStrDtLoc") { ref->actRestStrLoc = utcStrToUtc(value); }///
	else if (headers[index] == "actEndDtLocal") { ref->actEndLoc = utcStrToUtc(value); }///

	else if (headers[index] == "assignment") {
		if (_isForV2(headers)) {
			ref->duty = value;
		}
		else { //3.0 用assignment对应qualifier
			ref->qualifier = value;
		}
	}///duty
	else if (headers[index] == "assignmentGroup") {ref->duty = value;}///duty
	else if (headers[index] == "actingRank") { ref->actingRank = value; }
	else if (headers[index] == "position") { ref->position = value; }
	else if (headers[index] == "location") { ref->location = value; }///
	else if (headers[index] == "preference") { ref->preference = value; }
	else if (headers[index] == "source") { ref->source = value; }

	else if (headers[index] == "appId") { ref->appId = value; }
	else if (headers[index] == "calloutDt") { ref->calloutUtc = utcStrToUtc(value); }
	else if (headers[index] == "callOutDtUtc") { ref->calloutUtc = utcStrToUtc(value); }
	else if (headers[index] == "publishedDt") { ref->publishedUtc = utcStrToUtc(value); }
	else if (headers[index] == "role") { ref->tmRole = value; }//mantis#2314, csv补齐roster.role
	else if (headers[index] == "groupId") { ref->tmGroupId = value; }//mantis#2314, csv补齐roster.role
	else if (headers[index] == "resourceCode") { ref->tmResourceCode = value; }
	else if (headers[index] == "tmProgramCourseId" && (value != NULL && strlen(value) != 0)) { ref->tmProgramCourseId = stoll(value); }
	else if (headers[index] == "parentTmProgramCourseId" && (value != NULL && strlen(value) != 0)) { ref->tmParentProgramCourseId = stoll(value); }
	else if (headers[index] == "qualifier") { ref->qualifier = value; }///

	else if (headers[index] == "swapCrewId") { }///
	else if (headers[index] == "training") { ref->isTraining = (isValueYesTrueOne(value) ? "Y" : ""); }///isTraining
	else if (headers[index] == "comments") { ref->comments = value; }
	else if (headers[index] == "isDeleted") { ref->isDelete = (isValueYesTrueOne(value) ? "Y" : "N"); }///isDelete
	else if (headers[index] == "isPublished") { ref->isPublished = (0 == memcmp(value, "true", 4) ? "Y" : "N"); }
	else if (headers[index] == "isRequested") { ref->isRequested = (0 == memcmp(value, "true", 4) ? true : false); }
	else if (headers[index] == "isLegal") { ref->_isLegal = (0 == memcmp(value, "true", 4) ? true : false); }///

	else if (headers[index] == "isSwapped") { ref->isSwapped = (0 == memcmp(value, "true", 4) ? true : false); }
	else if (headers[index] == "subRole") { ref->subRole = value; }
	else if (headers[index] == "origin") { ref->origin = value; }
	else if (headers[index] == "modifiedBy") { ref->idUser = value; }
	else if (headers[index] == "lastModified") { ref->tmst = utcStrToUtc(value); }
	else if (headers[index] == "createdBy") { ref->createdBy = value; }
	else if (headers[index] == "createdDt") { ref->createdDt = utcStrToUtc(value); }
	else if (headers[index] == "ver") { ref->ver = atoi(value); }
	else if (headers[index] == "seqOrder") { ref->seqOrder = atoi(value); }
	else if (headers[index] == "memo") { ref->memo = value; }
	else if (headers[index] == "interfaceId") {}
	else if (headers[index] == "startDt") {}
	else if (headers[index] == "endDt") {}
	else if (headers[index] == "liveId") {}//废弃
	else if (headers[index] == "score") { ref->score = atoi(value); }
	else if (headers[index] == "actStrDtUtc") {}
	else if (headers[index] == "actEndDtUtc") {}

	else if (headers[index] == "perDiemMins") { ref->perDiemMins = atof(value); }
	else if (headers[index] == "lhPerDiemMins") { ref->lhPerDiemMins = atof(value); }
	else if (headers[index] == "fmPerDiemMins") { ref->fmPerDiemMins = atof(value); }
	else if (headers[index] == "fmLhPerDiemMins") { ref->fmLhPerDiemMins = atof(value); }
	else if (headers[index] == "creditedMinutes") { ref->creditMinutes = atof(value); }
	else if (headers[index] == "fmCreditedMinutes") { ref->fmCreditMinutes = atof(value); }
	else if (headers[index] == "workingHour") { ref->workingHour = atof(value); }

	else if (headers[index] == "schCreditedMinutes") { ref->schCreditMinutes = atof(value); }
	else if (headers[index] == "schFmCreditedMinutes") { ref->schFmCreditMinutes = atof(value); }
	else if (headers[index] == "schPerDiemMins") { ref->schPerDiemMins = atof(value); }
	else if (headers[index] == "schLhPerDiemMins") { ref->schLhPerDiemMins = atof(value); }
	else if (headers[index] == "schFmPerDiemMins") { ref->schFmPerDiemMins = atof(value); }
	else if (headers[index] == "schFmLhPerDiemMins") { ref->schFmLhPerDiemMins = atof(value); }
	else if (headers[index] == "schWorkingHour") { ref->schWorkingHour = atof(value); }

	else if (headers[index] == "isCallOut") { ref->isCallOut = (0 == strncmp("true", value, 4)); }
	else if (headers[index] == "callOutRosterId") { ref->callOutRosterId = atoll(value); }
	else if (headers[index] == "notificationTime") { ref->notificationTime = utcStrToUtc(value); }
	else if (headers[index] == "notificationRemark") { ref->notificationRemark = value; }
	else if (headers[index] == "actionDtUtc") {}
	else if (headers[index] == "schStrDtUtc") {}
	else if (headers[index] == "dpMinutes") { ref->dpMinutes = stoi(value); }
	else if (headers[index] == "minRest") {}
	else if (headers[index] == "maxFdpMin") {}
	else { logUnkonwnField("roster", headers[index]); }
}

