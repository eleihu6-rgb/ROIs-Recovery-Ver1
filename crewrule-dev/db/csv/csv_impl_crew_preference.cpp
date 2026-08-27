#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void crewPreferenceParser::init(vector<string>& headers) {}


//代码生成器:
//输入：id, crewId, prefType, pref, point, assignment, strDtLoc, endDtLoc, rosterId, rosterTradeId, pairingId, relatedCrewIds, label, attribute, priority, status, denialReason, denialComments, expDt, lastReviewDt, remark, createdBy, creationDt
//正则式处理序列
//1、',' --> '\r\n'
//2、toCsv：(.+) --> else if \(headers\[i\] == \"\0\"\) { ss << ref->\1 << ", "; }
//3、fromCsv：(.+) --> else if \(headers\[index\] == \"\0\"\) { ref->\1 = value;}

static vector<string> crewPreferenceDefaultHeaders = { "id", "crewId", "prefType", "pref", "point", "assignment", "strDtLoc", "endDtLoc", "rosterId", "rosterTradeId", "pairingId", "relatedCrewIds", "label", "attribute", "priority", "status", "denialReason", "denialComments", "expDt", "lastReviewDt", "remark", "createdBy", "creationDt", "transactionId", "reason", "leaveOrAbsenceCode", "outstanding", "leavedays", "granted", "workdays",
//20180515 ain, mantis#3342, crew_preference增加字段
"ver", "qualifier", "replaceOverlap", "isPublished", "publishedDt",
"changeStatus", "sort", "actingRank"};

vector<string>& crewPreferenceParser::getDefaultHeaders() {
	return crewPreferenceDefaultHeaders;
}

void* crewPreferenceParser::createInstance() {
	return new CREW_PREFERENCE();
}

void crewPreferenceParser::deleteInstance(void* obj) {
	delete (CREW_PREFERENCE*)obj;
}

string crewPreferenceParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CREW_PREFERENCE * ref = (CREW_PREFERENCE *)obj;
	
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idCrew << "^"; }
		else if (headers[i] == "prefType") { ss << ref->prefType << "^"; }
		else if (headers[i] == "pref") { ss << ref->pref << "^"; }
		else if (headers[i] == "point") { ss << ref->point << "^"; }
		else if (headers[i] == "assignment") { ss << ref->assignment << "^"; }
		else if (headers[i] == "strDtLoc") { ss << utcToUtcDtString(ref->strDtloc) << "^"; }
		else if (headers[i] == "endDtLoc") { ss << utcToUtcDtString(ref->endDtLoc) << "^"; }
		else if (headers[i] == "rosterId") { ss << ref->rosterId << "^"; }
		else if (headers[i] == "rosterTradeId") { ss << ref->rosterIdTrade << "^"; }
		else if (headers[i] == "pairingId") { ss << ref->pairingId << "^"; }
		else if (headers[i] == "relatedCrewIds") { ss << joinStrList(ref->relatedCrewIds) << "^"; }
		else if (headers[i] == "label") { ss << ref->label<< "^"; }
		else if (headers[i] == "attribute") { ss << ref->attribute<< "^"; }
		else if (headers[i] == "priority") { ss << ref->priority<< "^"; }
		else if (headers[i] == "status") { ss << ref->status<< "^"; }
		else if (headers[i] == "denialReason") { ss << ref->denialReason<< "^"; }
		else if (headers[i] == "denialComments") { ss << ref->denialComment<< "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcDtString(ref->expiryDt) << "^"; }
		else if (headers[i] == "lastReviewDt") { ss << utcToUtcDtString(ref->lastReviewDt) << "^"; }
		else if (headers[i] == "remark") { ss << ref->remark << "^"; }
		else if (headers[i] == "createdBy") { ss << ref->createBy << "^"; }
		else if (headers[i] == "creationDt") { ss << utcToUtcDtString(ref->createDt) << "^"; }
		else if (headers[i] == "transactionId") { ss << ref->transactionId << "^"; }
		else if (headers[i] == "reason") { ss << ref->reason << "^"; }
		else if (headers[i] == "leaveOrAbsenceCode") { ss << "^"; }

		else if (headers[i] == "outstanding") { ss << ref->outstanding << "^"; }///
		else if (headers[i] == "leavedays") { ss << ref->leavedays << "^"; }///
		else if (headers[i] == "granted") { ss << ref->granted << "^"; }///
		else if (headers[i] == "workdays") { ss << ref->workdays << "^"; }///

		else if (headers[i] == "ver") { ss << ref->ver << "^"; }
		else if (headers[i] == "qualifier") { ss << ref->qualifier << "^"; }
		else if (headers[i] == "replaceOverlap") { ss << ref->replaceOverlap << "^"; }
		else if (headers[i] == "isPublished") { ss << (ref->isPublished ? 1 : 0) << "^"; }
		else if (headers[i] == "publishedDt") { ss << utcToUtcTzString(ref->publishedDt) << "^"; }
		else if (headers[i] == "changeStatus") { ss << ref->changeStatus << "^"; }
		else if (headers[i] == "sort") { ss << ref->sort << "^"; }
		else if (headers[i] == "actingRank") { ss << ref->actingRank << "^"; }

		else { logUnkonwnField("crew_preference", headers[i]); }
	}
	return ss.str();
}

void crewPreferenceParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_PREFERENCE * ref = (CREW_PREFERENCE *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "crewId") { ref->idCrew = value; }
	else if (headers[index] == "prefType") { ref->prefType = value; }
	else if (headers[index] == "pref") { ref->pref = value; }
	else if (headers[index] == "point") { ref->point = atoi(value); }
	else if (headers[index] == "assignment") { ref->assignment = value; }
	else if (headers[index] == "strDtLoc") { ref->strDtloc = utcStrToUtc(value); }
	else if (headers[index] == "endDtLoc") { ref->endDtLoc = utcStrToUtc(value); }
	else if (headers[index] == "rosterId") { ref->rosterId = atoll(value); }
	else if (headers[index] == "rosterTradeId") { ref->rosterIdTrade = atoll(value); }
	else if (headers[index] == "pairingId") { ref->pairingId = atoll(value); }
	else if (headers[index] == "relatedCrewIds") { split(value, ',', ref->relatedCrewIds); }
	else if (headers[index] == "label") { ref->label = value; }
	else if (headers[index] == "attribute") { ref->attribute = value; }
	else if (headers[index] == "priority") { ref->priority = atoi(value); }
	else if (headers[index] == "status") { ref->status = value; }
	else if (headers[index] == "denialReason") { ref->denialReason = value; }
	else if (headers[index] == "denialComments") { ref->denialComment = value; }
	else if (headers[index] == "expDt") { ref->expiryDt = utcStrToUtc(value); }
	else if (headers[index] == "lastReviewDt") { ref->lastReviewDt = utcStrToUtc(value); }
	else if (headers[index] == "remark") { ref->remark = value; }
	else if (headers[index] == "createdBy") { ref->createBy = value; }
	else if (headers[index] == "creationDt") { ref->createDt = utcStrToUtc(value); }
	else if (headers[index] == "transactionId") { ref->transactionId = atoll(value); }
	else if (headers[index] == "reason") { ref->reason = value; }
	else if (headers[index] == "leaveOrAbsenceCode") {  }

	else if (headers[index] == "outstanding") { ref->outstanding = atoi(value); }
	else if (headers[index] == "leavedays") { ref->leavedays = atoi(value); }
	else if (headers[index] == "granted") { ref->granted = atoi(value); }
	else if (headers[index] == "workdays") { ref->workdays = atoi(value); }

	else if (headers[index] == "ver") { ref->ver = atoi(value); }
	else if (headers[index] == "qualifier") { ref->qualifier = value; }
	else if (headers[index] == "replaceOverlap") { ref->replaceOverlap = atoi(value); }
	else if (headers[index] == "isPublished") { ref->isPublished = atoi(value); }
	else if (headers[index] == "publishedDt") { ref->publishedDt = utcStrToUtc(value); }

	else if (headers[index] == "changeStatus") { ref->changeStatus = atoi(value); }
	else if (headers[index] == "sort") { ref->sort = atoi(value); }
	else if (headers[index] == "actingRank") { ref->actingRank = value; }

	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("crew_preference", headers[index]); }
}

