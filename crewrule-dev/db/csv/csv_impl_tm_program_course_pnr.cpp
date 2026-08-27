#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramCoursePnrParser::init(vector<string>& headers) {}


static vector<string> tmProgramCoursePnrDefaultHeaders = { "id","programId","tmProgramCourseId","tmPairingChartId","duration","unit","startTimeOption","startTime","timePeriodOption","timePeriod","attainedQual","needObs","needPip","pipNumber","pnrNumber","pnrBase","pnrRank","pnrFleet","pnrTeam","pnrQualOption","pnrQual","teActingRank","teRole","teConfigurableCourse","subIpRole",
"dayOfWeek","trainingDays","restDays","maxHoursPerDay","lastModified","modifiedBy"};
vector<string>& tmProgramCoursePnrParser::getDefaultHeaders() {
	return tmProgramCoursePnrDefaultHeaders;
}

void* tmProgramCoursePnrParser::createInstance() {
	return new TmProgramCoursePnr();
}

void tmProgramCoursePnrParser::deleteInstance(void* obj) {
	delete (TmProgramCoursePnr*)obj;
}

string tmProgramCoursePnrParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCoursePnr * ref = (TmProgramCoursePnr *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "tmProgramCourseId") { ss << ref->tmProgramCourseId << "^"; }
		else if (headers[i] == "tmPairingChartId") { ss << ref->tmPairingChartId << "^"; }
		else if (headers[i] == "duration") { ss << ref->duration << "^"; }
		else if (headers[i] == "unit") { ss << ref->unit << "^"; }
		else if (headers[i] == "startTimeOption") { ss << ref->startTimeOption << "^"; }
		else if (headers[i] == "startTime") { ss << ref->startTime << "^"; }
		else if (headers[i] == "timePeriodOption") { ss << ref->timePeriodOption << "^"; }
		else if (headers[i] == "timePeriod") { ss << ref->timePeriod << "^"; }
		else if (headers[i] == "attainedQual") { ss << ref->attainedQual << "^"; }
		else if (headers[i] == "needObs") { ss << (ref->needObs ? "1" : "0") << "^"; }
		else if (headers[i] == "needPip") { ss << (ref->needPip ? "1" : "0") << "^"; }
		else if (headers[i] == "pipNumber") { ss << ref->pipNumber << "^"; }
		else if (headers[i] == "pnrNumber") { ss << ref->pnrNumber << "^"; }
		else if (headers[i] == "pnrBase") { ss << ref->pnrBase << "^"; }
		else if (headers[i] == "pnrRank") { ss << ref->pnrRank << "^"; }
		else if (headers[i] == "pnrFleet") { ss << ref->pnrFleet << "^"; }
		else if (headers[i] == "pnrTeam") { ss << ref->pnrTeam << "^"; }
		else if (headers[i] == "pnrQualOption") { ss << ref->pnrQualOption << "^"; }
		else if (headers[i] == "pnrQual") { ss << ref->pnrQual << "^"; }

		else if (headers[i] == "teActingRank") { ss << ref->teActingRank << "^"; }
		else if (headers[i] == "teRole") { ss << ref->teRole << "^"; }
		else if (headers[i] == "teConfigurableCourse") { ss << ref->teConfigurableCourse << "^"; }
		else if (headers[i] == "subIpRole") { ss << ref->subIpRole << "^"; }

		else if (headers[i] == "dayOfWeek") { ss << ref->strDayOfWeek << "^"; }
		else if (headers[i] == "trainingDays") { ss << (ref->trainingDays == -1 ? "" : std::to_string(ref->trainingDays)) << "^"; }
		else if (headers[i] == "restDays") { ss << (ref->restDays == -1 ? "" : std::to_string(ref->restDays)) << "^"; }
		else if (headers[i] == "maxHoursPerDay") { ss << (ref->maxHoursPerDay == -1 ? "" : std::to_string(ref->maxHoursPerDay)) << "^"; }

		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramCoursePnr", headers[i]); }
	}
	return ss.str();
}

void tmProgramCoursePnrParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCoursePnr * ref = (TmProgramCoursePnr *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "programId") { ref->programId = atoll(value); }
	else if (headers[index] == "tmProgramCourseId") { ref->tmProgramCourseId = atoll(value); }
	else if (headers[index] == "tmPairingChartId") { ref->tmPairingChartId = atoll(value); }
	else if (headers[index] == "duration") {  ref->duration = atof(value); }
	else if (headers[index] == "unit") { ref->unit = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
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
	else if (headers[index] == "attainedQual") { ref->attainedQual = value; }
	else if (headers[index] == "needObs") { ref->needObs = (atoi(value) == 1); }
	else if (headers[index] == "needPip") { ref->needPip = (atoi(value) == 1); }
	else if (headers[index] == "pipNumber") { 
		ref->pipNumber = (value == NULL || strlen(value) == 0) ? -1 : atoi(value);
	}
	else if (headers[index] == "pnrNumber") { 
		ref->pnrNumber = (value == NULL || strlen(value) == 0) ? -1 : atoi(value);
	}
	else if (headers[index] == "pnrBase") { 
		ref->pnrBase = value;
		if (!ref->pnrBase.empty() && ref->pnrBase != "ALL" && ref->pnrBase != "*") {
			split(ref->pnrBase, '|', ref->pnrBases);
		}
	}
	else if (headers[index] == "pnrRank") { 
		ref->pnrRank = value;
		if (!ref->pnrRank.empty() && ref->pnrRank != "ALL" && ref->pnrRank != "*") {
			split(ref->pnrRank, '|', ref->pnrRanks);
		}
	}
	else if (headers[index] == "pnrFleet") { 
		ref->pnrFleet = value;
		if (!ref->pnrFleet.empty() && ref->pnrFleet != "ALL" && ref->pnrFleet != "*") {
			split(ref->pnrFleet, '|', ref->pnrFleets);
		}
	}
	else if (headers[index] == "pnrTeam") { 
		ref->pnrTeam = value;
		if (!ref->pnrTeam.empty() && ref->pnrTeam != "ALL" && ref->pnrTeam != "*") {
			split(ref->pnrTeam, '|', ref->pnrTeams);
		}
	}
	else if (headers[index] == "pnrQualOption") { ref->pnrQualOption = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "pnrQual") { 
		ref->pnrQual = value;
		if (!ref->pnrQual.empty() && ref->pnrQual != "*") {
			split(ref->pnrQual, '|', ref->pnrQuals);
			for (auto& qual : ref->pnrQuals) {
				if (qual.length() > 4) {
					//移除后缀_P_Q
					qual.erase(qual.length() - 4, 4);
				}
			}
		}
	}

	else if (headers[index] == "teActingRank") {
		ref->teActingRank = value;
		if (!ref->teActingRank.empty() && ref->teActingRank != "*") {
			split(ref->teActingRank, '|', ref->teActingRanks);
		}
	}
	else if (headers[index] == "teRole") {
		ref->teRole = value;
		if (!ref->teRole.empty() && ref->teRole != "*") {
			split(ref->teRole, '|', ref->teRoles);
		}
	}
	else if (headers[index] == "teConfigurableCourse") { ref->teConfigurableCourse = value; }
	else if (headers[index] == "subIpRole") { ref->subIpRole = value; }

	else if (headers[index] == "dayOfWeek") {
		ref->strDayOfWeek = value;
		if (!ref->strDayOfWeek.empty()) {
			split(ref->strDayOfWeek.c_str(), ',', ref->dayOfWeeks);
		}
	}
	else if (headers[index] == "trainingDays") { ref->trainingDays = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "restDays") { ref->restDays = (strlen(value) == 0 ? -1 : atoi(value)); }
	else if (headers[index] == "maxHoursPerDay") { ref->maxHoursPerDay = (strlen(value) == 0 ? -1 : atoi(value)); }

	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmProgramCoursePnr", headers[index]); }
}

