#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmFootprintCourseTraineeParser::init(vector<string>& headers) {}

static vector<string> tmFootprintCourseTraineeDefaultHeaders = {
    "id", "footprintId", "footprintCourseId", "duration", "unit",
    "startTimeOption", "startTime", "timePeriodOption", "timePeriod",
    "modifiedBy", "lastModified"
};
vector<string>& tmFootprintCourseTraineeParser::getDefaultHeaders() {
    return tmFootprintCourseTraineeDefaultHeaders;
}

void* tmFootprintCourseTraineeParser::createInstance() {
    return new TmFootprintCourseTrainee();
}

void tmFootprintCourseTraineeParser::deleteInstance(void* obj) {
    delete (TmFootprintCourseTrainee*)obj;
}

string tmFootprintCourseTraineeParser::toCsv(vector<string>& headers, void* obj) {
    stringstream ss;
    TmFootprintCourseTrainee *ref = (TmFootprintCourseTrainee *)obj;
    for (std::size_t i = 0; i < headers.size(); i++) {
        if (headers[i] == "id") { ss << ref->id << "^"; }
        else if (headers[i] == "footprintId") { ss << ref->footprintId << "^"; }
        else if (headers[i] == "footprintCourseId") { ss << ref->footprintCourseId << "^"; }
        else if (headers[i] == "duration") { ss << ref->duration << "^"; }
        else if (headers[i] == "unit") { ss << ref->unit << "^"; }
        else if (headers[i] == "startTimeOption") { ss << ref->startTimeOption << "^"; }
        else if (headers[i] == "startTime") { ss << ref->startTime << "^"; }
        else if (headers[i] == "timePeriodOption") { ss << ref->timePeriodOption << "^"; }
        else if (headers[i] == "timePeriod") { ss << ref->timePeriod << "^"; }
        else if (headers[i] == "modifiedBy") { ss << "^"; }
        else if (headers[i] == "lastModified") { ss << "^"; }
        else { logUnkonwnField("tmFootprintCourseTrainee", headers[i]); }
    }
    return ss.str();
}

void tmFootprintCourseTraineeParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
    TmFootprintCourseTrainee *ref = (TmFootprintCourseTrainee *)obj;

    if (headers[index] == "id") { ref->id = atoll(value); }
    else if (headers[index] == "footprintId") { ref->footprintId = atoll(value); }
    else if (headers[index] == "footprintCourseId") { ref->footprintCourseId = atoll(value); }
    else if (headers[index] == "duration") { ref->duration = atof(value); }
    else if (headers[index] == "unit") { ref->unit = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
    else if (headers[index] == "startTimeOption") { ref->startTimeOption = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
    else if (headers[index] == "startTime") {
        ref->startTime = value;
        std::vector<std::string> strStartTimeList;
        if (!ref->startTime.empty())
            split(ref->startTime, '|', strStartTimeList);
        for (auto& strStartTime : strStartTimeList) {
            int startTimeMinute = hhmmToMinutes(strStartTime.c_str());
            ref->startTimeMinutes.emplace_back(startTimeMinute);
        }
    }
    else if (headers[index] == "timePeriodOption") { ref->timePeriodOption = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
    else if (headers[index] == "timePeriod") {
        ref->timePeriod = value;
        std::vector<std::string> strTimePeriodList;
        if (!ref->timePeriod.empty())
            split(ref->timePeriod, '|', strTimePeriodList);
        for (auto& strTimePeriod : strTimePeriodList) {
            vector<string> splitstrs;
            split(strTimePeriod.c_str(), '-', splitstrs);
            if (splitstrs.size() >= 2) {
                int startMinute = hhmmToMinutes(splitstrs[0].c_str());
                int endMinute = hhmmToMinutes(splitstrs[1].c_str());
                ref->timePeriodStartMinutes.emplace_back(startMinute);
                ref->timePeriodEndMinutes.emplace_back(endMinute);
            }
        }
    }
    else if (headers[index] == "modifiedBy") {}
    else if (headers[index] == "lastModified") {}
    else { logUnkonwnField("tmFootprintCourseTrainee", headers[index]); }
}
