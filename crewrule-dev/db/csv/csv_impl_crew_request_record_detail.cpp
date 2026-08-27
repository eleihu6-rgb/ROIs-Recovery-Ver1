/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2024/8/16 10:57
 * @File:    csv_impl_crew_request_record_detail.cpp
 * @Version: 1.0.0
 * @Copyright (c) 2024 Pi-solution. All rights reserved.
**/
#include <sstream>
#include "Segment.h"
#include "UtilFunc.h"
#include "CrewDB.h"
#include "csv_impl.h"
#include "JsonLive.h"

using namespace rapidjson;


// id,reqId,crewId,type,status,assignment,assignmentGroup,priority,comment,remark,fileId,submitTime,startTime,endTime,pairingId,rosterId,approver,approvalTime,duration,balance,lastModified,modifiedBy
static vector<string> crewRequestRecordDetailDefaultHeaders = { "id", "reqId", "crewId", "type", "status", "assignment", "priority", "startDate", "endDate", "pairingId", "rosterId", "lastModified", "modifiedBy" };
vector<string>& crewRequestRecordDetailParser::getDefaultHeaders() {
    return crewRequestRecordDetailDefaultHeaders;
}

void crewRequestRecordDetailParser::init(vector<string>& headers) {}

void* crewRequestRecordDetailParser::createInstance() {
    return new CREW_REQUEST_RECORD_DETAIL();
}

void crewRequestRecordDetailParser::deleteInstance(void* obj) {
    delete (CREW_REQUEST_RECORD_DETAIL*)obj;
}

string crewRequestRecordDetailParser::toCsv(vector<string>& headers, void* obj) {
    stringstream ss;
    CREW_REQUEST_RECORD_DETAIL * ref = (CREW_REQUEST_RECORD_DETAIL *)obj;
    //"id", "reqId", "crewId", "type", "status", "assignment", "priority", "startDate", "endDate", "pairingId", "rosterId", "lastModified", "modifiedBy"
    for (std::size_t i = 0; i < headers.size(); i++) {
        if (headers[i] == "id") { ss << ref->id << "^"; }
        else if (headers[i] == "reqId") { ss << ref->reqId << "^"; }
        else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
        else if (headers[i] == "type") { ss << ref->type << "^"; }
        else if (headers[i] == "status") { ss << ref->status << "^"; }
        else if (headers[i] == "assignment") { ss << ref->assignment << "^"; }
        else if (headers[i] == "priority") { ss << ref->priority << "^"; }
        else if (headers[i] == "startTime") { ss << ref->startDateLocalStr << "^"; }
        else if (headers[i] == "endTime") { ss << ref->endDateLocalStr << "^"; }
        else if (headers[i] == "pairingId") { ss << ref->pairingId << "^"; }
        else if (headers[i] == "rosterId") { ss << ref->rosterId << "^"; }
        // RecordDetail中没有attributes字段，需要关联Record表reqId字段读取attributes
        // else if (headers[i] == "attributes") { ss << ref->attributes << "^"; }
        else if (headers[i] == "lastModified") { ss << utcToUtcDtString(ref->lastModified) << "^"; }
        else if (headers[i] == "modifiedBy") { ss << ref->modifiedBy << "^"; }
        // else { logUnkonwnField("crew_request_record_detail", headers[i]); }
    }
    return ss.str();
}

void crewRequestRecordDetailParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
    CREW_REQUEST_RECORD_DETAIL * ref = (CREW_REQUEST_RECORD_DETAIL *)obj;
    //"id", "reqId", "crewId", "type", "status", "assignment", "priority", "startDate", "endDate", "pairingId", "rosterId", "lastModified", "modifiedBy"

    if (headers[index] == "id") { ref->id = atoll(value); }
    else if (headers[index] == "reqId") { ref->reqId = atoll(value); }
    else if (headers[index] == "crewId") { ref->crewId = value; }
    else if (headers[index] == "type") { ref->type = value; }
    else if (headers[index] == "status") { ref->status = value; }
    else if (headers[index] == "assignment") { ref->assignment = value; }
    else if (headers[index] == "priority") { ref->priority = value; }
    else if (headers[index] == "startTime") { ref->startDtLoc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
    else if (headers[index] == "endTime") { ref->endDtLoc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
    else if (headers[index] == "pairingId") { ref->pairingId = atoll(value); }
    else if (headers[index] == "rosterId") { ref->rosterId = atoll(value); }
//    else if (headers[index] == "attributes") { ref->attributes = value; }
    else if (headers[index] == "lastModified") { ref->lastModified = utcStrToUtc(value); }
    else if (headers[index] == "modifiedBy") { ref->modifiedBy = value; }
    // else { logUnkonwnField("crew_request_record_detail", headers[index]); }
}

