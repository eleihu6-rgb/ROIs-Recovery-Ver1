#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmCourseParser::init(vector<string>& headers) {}


static vector<string> tmCourseDefaultHeaders = { "id","courseName","courseCode","courseDesc","effDate","expDate","courseType","structure","deviceType","deviceOption","deviceGroup","division","projectQual","startTimeOption","startTime","timePeriodOption","timePeriod","briefTime","briefApplicable","debriefTime","debriefApplicable","circle","traineeNumMin","traineeNumMax","traineeBase","traineeRank","traineeFleet","traineeTeam","checkPoint","instructorNumMin","instructorNumMax","instructorQual","needObs","checkerNumMin","checkerNumMax","checkerQual","lineAttr","createTime","status","sector","assignment","assignmentGroup","modifiedBy","lastModified","creditFlag","courseComments",
	"dayOfWeek","trainingDays","restDays","maxHoursPerDay","gapBefore","gapAfter","gapRestriction" };

vector<string>& tmCourseParser::getDefaultHeaders() {
	return tmCourseDefaultHeaders;
}

void* tmCourseParser::createInstance() {
	return new TmCourse();
}

void tmCourseParser::deleteInstance(void* obj) {
	delete (TmCourse*)obj;
}

string tmCourseParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmCourse * ref = (TmCourse *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "courseName") { ss << ref->courseName << "^"; }
		else if (headers[i] == "courseCode") { ss << ref->courseCode << "^"; }
		else if (headers[i] == "courseDesc") { ss << "^"; }
		else if (headers[i] == "effDate") { ss << utcToUtcTzString(ref->effDate) << "^"; }
		else if (headers[i] == "expDate") { ss << utcToUtcTzString(ref->expDate) << "^"; }
		else if (headers[i] == "courseType") { ss << ref->courseType << "^"; }
		else if (headers[i] == "structure") { ss << "^"; }
		else if (headers[i] == "deviceType") { ss << "^"; }
		else if (headers[i] == "deviceOption") { ss << "^"; }
		else if (headers[i] == "deviceGroup") { ss << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "projectQual") { ss << ref->projectQual << "^"; }
		else if (headers[i] == "startTimeOption") { ss << "^"; }
		else if (headers[i] == "startTime") { ss << "^"; }
		else if (headers[i] == "timePeriodOption") { ss << "^"; }
		else if (headers[i] == "timePeriod") { ss << "^"; }
		else if (headers[i] == "briefTime") { ss << "^"; }
		else if (headers[i] == "briefApplicable") { ss << "^"; }
		else if (headers[i] == "debriefTime") { ss << "^"; }
		else if (headers[i] == "debriefApplicable") { ss << "^"; }
		else if (headers[i] == "circle") { ss << "^"; }
		else if (headers[i] == "traineeNumMin") {
			if (ref->traineeNumMin < 0)
				ss << "^";
			else
				ss << ref->traineeNumMin << "^";
		}
		else if (headers[i] == "traineeNumMax") {
			if (ref->traineeNumMax < 0)
				ss << "^";
			else
				ss << ref->traineeNumMax << "^";
		}
		else if (headers[i] == "traineeBase") { ss << ref->traineeBase << "^"; }
		else if (headers[i] == "traineeRank") { ss << ref->traineeRank << "^"; }
		else if (headers[i] == "traineeFleet") { ss << ref->traineeFleet << "^"; }
		else if (headers[i] == "traineeTeam") { ss << ref->traineeTeam << "^"; }
		else if (headers[i] == "checkPoint") { ss << "^"; }
		else if (headers[i] == "instructorNumMin") { 
			if (ref->instructorNumMin < 0)
				ss << "^";
			else
				ss << ref->instructorNumMin << "^"; 
		}
		else if (headers[i] == "instructorNumMax") {
			if (ref->instructorNumMax < 0)
				ss << "^";
			else
				ss << ref->instructorNumMax << "^"; 
		}
		else if (headers[i] == "instructorQual") { ss << ref->instructorQual << "^"; }
		else if (headers[i] == "needObs") { ss << "^"; }
		else if (headers[i] == "checkerNumMin") { 
			if (ref->checkerNumMin < 0)
				ss << "^";
			else
				ss << ref->checkerNumMin << "^";
		}
		else if (headers[i] == "checkerNumMax") {
			if (ref->checkerNumMax < 0)
				ss << "^";
			else
				ss << ref->checkerNumMax << "^";
		}
		else if (headers[i] == "checkerQual") { ss << ref->checkerQual << "^"; }
		else if (headers[i] == "lineAttr") { ss << ref->lineAttr << "^"; }
		else if (headers[i] == "createTime") { ss << "^"; }
		else if (headers[i] == "status") { ss << ref->status << "^"; }
		else if (headers[i] == "sector") { 
			if (ref->sector < 0)
				ss << "^";
			else
				ss << ref->sector << "^";
		}
		else if (headers[i] == "assignment") { ss << ref->assignment << "^"; }
		else if (headers[i] == "assignmentGroup") { ss << ref->assignmentGroup << "^"; }
		else if (headers[i] == "dayOfWeek") { ss << ref->strDayOfWeek << "^"; }
		else if (headers[i] == "trainingDays") { ss << (ref->trainingDays == -1 ? "" : std::to_string(ref->trainingDays)) << "^"; }
		else if (headers[i] == "restDays") { ss << (ref->restDays == -1 ? "" : std::to_string(ref->restDays)) << "^"; }
		else if (headers[i] == "maxHoursPerDay") { ss << (ref->maxHoursPerDay == -1 ? "" : std::to_string(ref->maxHoursPerDay)) << "^"; }
		else if (headers[i] == "gapBefore") { ss << (ref->gapBefore == -1 ? "" : std::to_string(ref->gapBefore)) << "^"; }
		else if (headers[i] == "gapAfter") { ss << (ref->gapAfter == -1 ? "" : std::to_string(ref->gapAfter)) << "^"; }
		else if (headers[i] == "gapRestriction") { ss << ref->gapRestriction << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "tmCreditFlag" || headers[i] == "creditFlag") { ss << (ref->tmCreditFlag ? "1" : "0") << "^"; }
		else if (headers[i] == "courseComments") { ss << "^"; }
		else { logUnkonwnField("tmCourse", headers[i]); }
	}
	return ss.str();
}

void tmCourseParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmCourse * ref = (TmCourse *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "courseName") { ref->courseName = value; }
	else if (headers[index] == "courseCode") { ref->courseCode = value; }
	else if (headers[index] == "courseDesc") {}
	else if (headers[index] == "effDate") { ref->effDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "expDate") { ref->expDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "courseType") { ref->courseType = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "structure") {}
	else if (headers[index] == "deviceType") { ref->deviceType = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "deviceOption") { ref->deviceOption =  (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "deviceGroup") {
		ref->deviceGroup = (value == NULL || strlen(value) == 0) ? "" : value;
		if (!ref->deviceGroup.empty())
			split(ref->deviceGroup, '|', ref->deviceGroups);
	}
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "projectQual") {
		ref->projectQual = (value == NULL || strlen(value) == 0) ? "" : value;
		if (!ref->projectQual.empty())
			split(ref->projectQual, '|', ref->projectQuals);
	}
	else if (headers[index] == "startTimeOption") { ref->startTimeOption = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "startTime") {
		ref->startTime = value;

		std::vector<std::string> strStartTimeList;
		if (!ref->startTime.empty())
			split(ref->startTime, '|', strStartTimeList);
		for (auto& strStartTime : strStartTimeList) {
			int startTimeMinute = hhmmToMinutes(strStartTime.c_str());//开始时间的分钟数
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
	else if (headers[index] == "briefTime") {}
	else if (headers[index] == "briefApplicable") {}
	else if (headers[index] == "debriefTime") {}
	else if (headers[index] == "debriefApplicable") {}
	else if (headers[index] == "circle") {}
	else if (headers[index] == "traineeNumMin") { ref->traineeNumMin = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "traineeNumMax") { ref->traineeNumMax = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "traineeBase") { ref->traineeBase = value; }
	else if (headers[index] == "traineeRank") { ref->traineeRank = value; }
	else if (headers[index] == "traineeFleet") { ref->traineeFleet = value; }
	else if (headers[index] == "traineeTeam") { ref->traineeTeam = value; }
	else if (headers[index] == "checkPoint") {}
	else if (headers[index] == "instructorNumMin") { ref->instructorNumMin = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "instructorNumMax") { ref->instructorNumMax = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "instructorQual") { ref->instructorQual = value; }
	else if (headers[index] == "needObs") {}
	else if (headers[index] == "checkerNumMin") { ref->checkerNumMin = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "checkerNumMax") { ref->checkerNumMax = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "checkerQual") { ref->checkerQual = value; }
	else if (headers[index] == "lineAttr") { ref->lineAttr = value; }
	else if (headers[index] == "createTime") {}
	else if (headers[index] == "status") { ref->status = value; }
	else if (headers[index] == "sector") { ref->sector = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "assignment") { ref->assignment = value; }
	else if (headers[index] == "assignmentGroup") { ref->assignmentGroup = value; }

	else if (headers[index] == "dayOfWeek") { 
		ref->strDayOfWeek = value; 
		if (!ref->strDayOfWeek.empty()) {
			split(ref->strDayOfWeek.c_str(), ',', ref->dayOfWeeks);
		}
	}
	else if (headers[index] == "trainingDays") { ref->trainingDays = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "restDays") { ref->restDays = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "maxHoursPerDay") { ref->maxHoursPerDay = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "gapBefore") { ref->gapBefore = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "gapAfter") { ref->gapAfter = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "gapRestriction") { ref->gapRestriction = value; }

	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "tmCreditFlag" || headers[index] == "creditFlag") { ref->tmCreditFlag = (isValueYesTrueOne(value) ? true : false); }
	else if (headers[index] == "courseComments") {}
	else if (headers[index] == "externalCourseId") {}
	else if (headers[index] == "shortDesc") {}
	else if (headers[index] == "extraCourseTip") {}
	else if (headers[index] == "source") {}
	else { logUnkonwnField("tmCourse", headers[index]); }
}

