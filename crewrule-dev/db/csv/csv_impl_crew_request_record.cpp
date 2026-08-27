/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2024/8/16 11:22
 * @File:    csv_impl_crew_request_record.cpp
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

// id,crewId,type,phase,assignment,assignmentGroup,status,preference,submitTime,createdBy,crewName,team,base,position,approver,approvalTime,lastModified,modifiedBy
static vector<string> crewRequestRecordDefaultHeaders = { "id", "crewId", "type", "assignment", "assignmentGroup", "preference"};
vector<string>& crewRequestRecordParser::getDefaultHeaders() {
    return crewRequestRecordDefaultHeaders;
}

void crewRequestRecordParser::init(vector<string>& headers) {}

void* crewRequestRecordParser::createInstance() {
    return new CREW_REQUEST_RECORD();
}

void crewRequestRecordParser::deleteInstance(void* obj) {
    delete (CREW_REQUEST_RECORD*)obj;
}

string crewRequestRecordParser::toCsv(vector<string>& headers, void* obj) {
    stringstream ss;
    CREW_REQUEST_RECORD * ref = (CREW_REQUEST_RECORD *)obj;
    //"id", "crewId", "type", "assignment", "assignmentGroup", "preference"
    for (std::size_t i = 0; i < headers.size(); i++) {
        if (headers[i] == "id") { ss << ref->id << "^"; }
        else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
        else if (headers[i] == "type") { ss << ref->type << "^"; }
        else if (headers[i] == "assignment") { ss << ref->assignment << "^"; }
        else if (headers[i] == "assignmentGroup") { ss << ref->assignmentGroup << "^"; }
        // RecordDetail中没有attributes字段，需要关联Record表reqId字段读取attributes
        else if (headers[i] == "preference") { ss << ref->preference << "^"; }
        // else { logUnkonwnField("crew_request_record", headers[i]); }
    }
    return ss.str();
}

void crewRequestRecordParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
    CREW_REQUEST_RECORD * ref = (CREW_REQUEST_RECORD *)obj;
    //"id", "crewId", "type", "assignment", "assignmentGroup", "preference"

    if (headers[index] == "id") { ref->id = atoll(value); }
    else if (headers[index] == "crewId") { ref->crewId = value; }
    else if (headers[index] == "type") { ref->type = value; }
    else if (headers[index] == "assignment") { ref->assignment = value; }
    else if (headers[index] == "assignmentGroup") { ref->assignmentGroup = value; }
    else if (headers[index] == "preference") { ref->preference = value; }
    // else { logUnkonwnField("crew_request_record", headers[index]); }
}

