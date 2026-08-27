#include <string>
#include <sstream>
#include <algorithm>
#include "JsonPairing.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "Log/Logger.h"

void parseFieldTime(time_t& field, Value& json, const char* fieldName, const char* defaultValue) {

	if (json.HasMember(fieldName)) {
		if (json[fieldName].IsString()) {
			char* value = (char*)json[fieldName].GetString();
			field = (value == NULL || strlen(value) == 0) ? utcStrToUtc(const_cast<char*>(defaultValue)) : utcStrToUtc(value);
		}
		else
			field = json[fieldName].GetInt64();
	}
}

SharedPtr<Entity> parseJson_TmProgramCourse(Value& jsonItem) {
	SharedPtr<TmProgramCourse> item = std::make_shared<TmProgramCourse>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("courseId")) item->courseId = jsonItem["courseId"].GetInt64();

	parseFieldTime(item->plannedDate, jsonItem, "plannedDate", "9999-12-31");
	parseFieldTime(item->rosterDate, jsonItem, "rosterDate", "9999-12-31");

	if (jsonItem.HasMember("rosterId")) item->rosterId = jsonItem["rosterId"].GetInt64();
	if (jsonItem.HasMember("rosterGroundId")) item->rosterGroundId = jsonItem["rosterGroundId"].GetInt64();
	if (jsonItem.HasMember("resourceCode")) item->resourceCode = jsonItem["resourceCode"].GetString();
	if (jsonItem.HasMember("groupId")) item->groupId = jsonItem["groupId"].GetString();
	if (jsonItem.HasMember("parentId")) item->parentId = jsonItem["parentId"].GetInt64();
	if (jsonItem.HasMember("role")) item->role = jsonItem["role"].GetString();

	parseFieldTime(item->startTime, jsonItem, "startTime", "9999-12-31");
	parseFieldTime(item->endTime, jsonItem, "endTime", "9999-12-31");
	if (jsonItem.HasMember("publishFlag")) item->publishFlag = jsonItem["publishFlag"].GetInt();
	if (jsonItem.HasMember("coursePhase")) {
		item->coursePhase = jsonItem["coursePhase"].GetString();
	}
	if (jsonItem.HasMember("courseSeq")) {
		double courseSeq = jsonItem["courseSeq"].GetDouble();
		item->courseSortSeq = courseSeq;
		if (!jsonItem.HasMember("strCourseSeq")) {
			item->courseSeq = Utility::GetInstancePtr()->ToString(courseSeq);
		}
	}
	if (jsonItem.HasMember("strCourseSeq")) {
		item->courseSeq = jsonItem["strCourseSeq"].GetString();
	}
	if (jsonItem.HasMember("crewId")) item->crewId = jsonItem["crewId"].GetString();

	if (jsonItem.HasMember("fltId")) item->fltId = jsonItem["fltId"].GetInt64();
	//if (jsonItem.HasMember("fleet")) item->fleet = jsonItem["fleet"].GetString();
	//if (jsonItem.HasMember("depStation")) item->depStation = jsonItem["depStation"].GetString();
	//if (jsonItem.HasMember("arrStation")) item->arrStation = jsonItem["arrStation"].GetString();
	//parseFieldTime(item->actStartTimeUtc, jsonItem, "actDepDtUtc", "9999-12-31");
	//parseFieldTime(item->actEndTimeUtc, jsonItem, "actArvDtUtc", "9999-12-31");
	if (jsonItem.HasMember("rfAssignment")) item->rfAssignment = jsonItem["rfAssignment"].GetString();

	if (jsonItem.HasMember("deviceTimeId")) item->deviceTimeId = jsonItem["deviceTimeId"].GetInt64();
	if (jsonItem.HasMember("simioe")) item->simioe = strToUpper(jsonItem["simioe"].GetString());
	if (jsonItem.HasMember("coursePreposition")) {
		item->coursePreposition = jsonItem["coursePreposition"].GetString();

		vector<string> splits;
		split(item->coursePreposition, '|', splits);
		item->coursePrepositions.clear();
		for (auto& part : splits) {
			item->coursePrepositions.emplace(part.c_str());
		}
	}
	
	if (jsonItem.HasMember("status")) item->status = strToUpper(jsonItem["status"].GetString());
	if (jsonItem.HasMember("isExtraCourse")) item->isExtraCourse = (jsonItem["isExtraCourse"].GetInt() == 1);
	if (jsonItem.HasMember("trainingResult")) item->trainingResult = strToUpper(jsonItem["trainingResult"].GetString());

	if (jsonItem.HasMember("subTmProgramCourseId")) item->subTmProgramCourseId = jsonItem["subTmProgramCourseId"].GetInt64();

	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramCourseLimitation(Value& jsonItem) {
	SharedPtr<TmProgramCourseLimitation> item = std::make_shared<TmProgramCourseLimitation>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("programCourseId")) item->programCourseId = jsonItem["programCourseId"].GetInt64();
	if (jsonItem.HasMember("programPnrId")) item->programCoursePnrId = jsonItem["programPnrId"].GetInt64();
	if (jsonItem.HasMember("limitOption")) item->limitOption = strToUpper(jsonItem["limitOption"].GetString());
	if (jsonItem.HasMember("limitSeq")) {
		item->limitSeq = jsonItem["limitSeq"].GetString();
		item->limitCourseSeqs.clear();
		if (!item->limitSeq.empty() && item->limitSeq != "*") {
			split(item->limitSeq, '|', item->limitCourseSeqs);
		}
	}

	if (jsonItem.HasMember("startRole")) {
		item->startRole = jsonItem["startRole"].GetString();
		item->startRoles.clear();
		if (!item->startRole.empty() && item->startRole != "*") {
			split(item->startRole, '|', item->startRoles);
		}
	}
	if (jsonItem.HasMember("endRole")) {
		item->endRole = jsonItem["endRole"].GetString();
		item->endRoles.clear();
		if (!item->endRole.empty() && item->endRole != "*") {
			split(item->endRole, '|', item->endRoles);
		}
	}
	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}


SharedPtr<Entity> parseJson_TmProgramCourseRole(Value& jsonItem) {
	SharedPtr<TmProgramCourseRole> item = std::make_shared<TmProgramCourseRole>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("programCourseId")) item->programCourseId = jsonItem["programCourseId"].GetInt64();
	if (jsonItem.HasMember("programPnrId")) item->programCoursePnrId = jsonItem["programPnrId"].GetInt64();
	if (jsonItem.HasMember("bases")) { 
		item->base = jsonItem["bases"].GetString();
		item->bases.clear();
		if (!item->base.empty() && item->base != "ALL" && item->base != "*") {
			split(item->base, '|', item->bases);
		}
	}
	if (jsonItem.HasMember("ranks")) {
		item->rank = jsonItem["ranks"].GetString();
		item->ranks.clear();
		if (!item->rank.empty() && item->rank != "ALL" && item->rank != "*") {
			split(item->rank, '|', item->ranks);
		}
	}
	if (jsonItem.HasMember("fleets")) { 
		item->fleet = jsonItem["fleets"].GetString(); 
		item->fleets.clear();
		if (!item->fleet.empty() && item->fleet != "ALL" && item->fleet != "*") {
			split(item->fleet, '|', item->fleets);
		}
	}
	if (jsonItem.HasMember("teams")) {
		item->team = jsonItem["teams"].GetString();
		item->teams.clear();
		if (!item->team.empty() && item->team != "ALL" && item->team != "*") {
			split(item->team, '|', item->teams);
		}
	}
	if (jsonItem.HasMember("actingRanks")) {
		item->actingRank = jsonItem["actingRanks"].GetString();
		item->actingRanks.clear();
		if (!item->actingRank.empty() && item->actingRank != "ALL" && item->actingRank != "*") {
			split(item->actingRank, '|', item->actingRanks);
		}
	}
	if (jsonItem.HasMember("role")) item->role = jsonItem["role"].GetString();
	if (jsonItem.HasMember("roleNumber")) item->roleNumber = jsonItem["roleNumber"].GetInt();
	if (jsonItem.HasMember("roleType")) item->roleType = strToUpper(jsonItem["roleType"].GetString());
	if (jsonItem.HasMember("needPip")) item->needPip = (jsonItem["needPip"].GetInt() == 1);
	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");


	return std::static_pointer_cast<Entity>(item);
}


SharedPtr<Entity> parseJson_TmProgramCourseRoleQual(Value& jsonItem) {
	SharedPtr<TmProgramCourseRoleQual> item = std::make_shared<TmProgramCourseRoleQual>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("programCourseId")) item->programCourseId = jsonItem["programCourseId"].GetInt64();
	if (jsonItem.HasMember("programPnrId")) item->programCoursePnrId = jsonItem["programPnrId"].GetInt64();
	if (jsonItem.HasMember("programCourseRoleId")) item->programCourseRoleId = jsonItem["programCourseRoleId"].GetInt64();
	if (jsonItem.HasMember("roleQualOption")) item->roleQualOption = strToUpper(jsonItem["roleQualOption"].GetString());
	if (jsonItem.HasMember("roleQual")) {
		item->roleQual = jsonItem["roleQual"].GetString();
		item->roleQuals.clear();
		if (!item->roleQual.empty() && item->roleQual != "ALL" && item->roleQual != "*") {
			split(item->roleQual, '|', item->roleQuals);
			for (auto& qual : item->roleQuals) {
				//移除后缀_P_Q
				if (qual.length() > 4) {
					qual.erase(qual.length() - 4, 4);
				}
			}
		}
	}
	if (jsonItem.HasMember("roleNumber")) item->roleNumber = jsonItem["roleNumber"].GetInt();

	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramCourseRoleLimitation(Value& jsonItem) {
	SharedPtr<TmProgramCourseRoleLimitation> item = std::make_shared<TmProgramCourseRoleLimitation>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("programCourseId")) item->programCourseId = jsonItem["programCourseId"].GetInt64();
	if (jsonItem.HasMember("programPnrId")) item->programCoursePnrId = jsonItem["programPnrId"].GetInt64();
	if (jsonItem.HasMember("programCourseRoleId")) item->programCourseRoleId = jsonItem["programCourseRoleId"].GetInt64();
	if (jsonItem.HasMember("limitOption")) item->limitOption = strToUpper(jsonItem["limitOption"].GetString());
	if (jsonItem.HasMember("limitSeq")) {
		item->limitSeq = jsonItem["limitSeq"].GetString();
		item->limitCourseSeqs.clear();
		if (!item->limitSeq.empty() && item->limitSeq != "*") {
			split(item->limitSeq, '|', item->limitCourseSeqs);
		}
	}

	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramCourseIpRole(Value& jsonItem) {
	SharedPtr<TmProgramCourseIpRole> item = std::make_shared<TmProgramCourseIpRole>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("programCourseId")) item->programCourseId = jsonItem["programCourseId"].GetInt64();
	if (jsonItem.HasMember("programPnrId")) item->programCoursePnrId = jsonItem["programPnrId"].GetInt64();
	if (jsonItem.HasMember("bases")) {
		item->base = jsonItem["bases"].GetString();
		item->bases.clear();
		if (!item->base.empty() && item->base != "ALL" && item->base != "*") {
			split(item->base, '|', item->bases);
		}
	}
	if (jsonItem.HasMember("ranks")) {
		item->rank = jsonItem["ranks"].GetString();
		item->ranks.clear();
		if (!item->rank.empty() && item->rank != "ALL" && item->rank != "*") {
			split(item->rank, '|', item->ranks);
		}
	}

	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");


	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramCourseIpRoleBase(Value& jsonItem) {
	SharedPtr<TmProgramCourseIpRoleBase> item = std::make_shared<TmProgramCourseIpRoleBase>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("programCourseId")) item->programCourseId = jsonItem["programCourseId"].GetInt64();
	if (jsonItem.HasMember("programPnrId")) item->programCoursePnrId = jsonItem["programPnrId"].GetInt64();
	if (jsonItem.HasMember("programIpRoleId")) item->programCourseIpRoleId = jsonItem["programIpRoleId"].GetInt64();
	if (jsonItem.HasMember("fleets")) {
		item->fleet = jsonItem["fleets"].GetString();
		item->fleets.clear();
		if (!item->fleet.empty() && item->fleet != "ALL" && item->fleet != "*") {
			split(item->fleet, '|', item->fleets);
		}
	}
	if (jsonItem.HasMember("teams")) {
		item->team = jsonItem["teams"].GetString();
		item->teams.clear();
		if (!item->team.empty() && item->team != "ALL" && item->team != "*") {
			split(item->team, '|', item->teams);
		}
	}
	if (jsonItem.HasMember("actingRanks")) {
		item->actingRank = jsonItem["actingRanks"].GetString();
		item->actingRanks.clear();
		if (!item->actingRank.empty() && item->actingRank != "ALL" && item->actingRank != "*") {
			split(item->actingRank, '|', item->actingRanks);
		}
	}
	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");


	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramCourseIpRoleQual(Value& jsonItem) {
	SharedPtr<TmProgramCourseIpRoleQual> item = std::make_shared<TmProgramCourseIpRoleQual>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("programCourseId")) item->programCourseId = jsonItem["programCourseId"].GetInt64();
	if (jsonItem.HasMember("programPnrId")) item->programCoursePnrId = jsonItem["programPnrId"].GetInt64();
	if (jsonItem.HasMember("programIpRoleId")) item->programCourseIpRoleId = jsonItem["programIpRoleId"].GetInt64();
	if (jsonItem.HasMember("programIpRoleBaseId")) item->programCourseIpRoleBaseId = jsonItem["programIpRoleBaseId"].GetInt64();
	if (jsonItem.HasMember("roleQualOption")) item->roleQualOption = strToUpper(jsonItem["roleQualOption"].GetString());
	if (jsonItem.HasMember("roleQual")) {
		item->roleQual = jsonItem["roleQual"].GetString();
		item->roleQuals.clear();
		if (!item->roleQual.empty() && item->roleQual != "ALL" && item->roleQual != "*") {
			split(item->roleQual, '|', item->roleQuals);
			for (auto& qual : item->roleQuals) {
				//移除后缀_P_Q
				if (qual.length() > 4) {
					qual.erase(qual.length() - 4, 4);
				}
			}
		}
	}
	if (jsonItem.HasMember("roleNumber")) item->roleNumber = jsonItem["roleNumber"].GetInt();

	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramCourseIpck(Value& jsonItem) {
	SharedPtr<TmProgramCourseIpck> item = std::make_shared<TmProgramCourseIpck>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("tmProgramCourseId")) item->tmProgramCourseId = jsonItem["tmProgramCourseId"].GetInt64();
	if (jsonItem.HasMember("tmProgramCoursePnrId")) item->tmProgramCoursePnrId = jsonItem["tmProgramCoursePnrId"].GetInt64();

	if (jsonItem.HasMember("ipckQualOption")) item->ipckQualOption = strToUpper(jsonItem["ipckQualOption"].GetString());
	if (jsonItem.HasMember("ipckQual")) {
		item->ipckQual = jsonItem["ipckQual"].GetString();
		item->ipckQuals.clear();
		if (!item->ipckQual.empty() && item->ipckQual != "ALL" && item->ipckQual != "*") {
			split(item->ipckQual, '|', item->ipckQuals);
			for (auto& qual : item->ipckQuals) {
				//移除后缀_P_Q
				if (qual.length() > 4) {
					qual.erase(qual.length() - 4, 4);
				}
			}
		}
	}
	if (jsonItem.HasMember("ipckNumber")) item->ipckNumber = jsonItem["ipckNumber"].GetInt();

	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramCoursePnr(Value& jsonItem) {
	SharedPtr<TmProgramCoursePnr> item = std::make_shared<TmProgramCoursePnr>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("tmProgramCourseId")) item->tmProgramCourseId = jsonItem["tmProgramCourseId"].GetInt64();
	if (jsonItem.HasMember("tmPairingChartId")) item->tmPairingChartId = jsonItem["tmPairingChartId"].GetInt64();
	
	if (jsonItem.HasMember("duration")) item->duration = jsonItem["duration"].GetDouble();
	if (jsonItem.HasMember("unit")) item->unit = strToUpper(jsonItem["unit"].GetString());

	if (jsonItem.HasMember("startTimeOption")) item->startTimeOption = strToUpper(jsonItem["startTimeOption"].GetString());
	if (jsonItem.HasMember("startTime")) {
		item->startTime = jsonItem["startTime"].GetString();

		std::vector<std::string> strStartTimeList;
		if (!item->startTime.empty())
			split(item->startTime, '|', strStartTimeList);
		item->startTimeMinutes.clear();
		for (auto& strStartTime : strStartTimeList) {
			int startTimeMinute = hhmmToMinutes(strStartTime.c_str());//开始时间的分钟数
			item->startTimeMinutes.emplace_back(startTimeMinute);
		}
	}

	if (jsonItem.HasMember("timePeriodOption")) item->timePeriodOption = strToUpper(jsonItem["timePeriodOption"].GetString());
	if (jsonItem.HasMember("timePeriod")) {
		item->timePeriod = jsonItem["timePeriod"].GetString();

		std::vector<std::string> strTimePeriodList;
		if (!item->timePeriod.empty())
			split(item->timePeriod, '|', strTimePeriodList);
		item->timePeriodStartMinutes.clear();
		item->timePeriodEndMinutes.clear();
		for (auto& strTimePeriod : strTimePeriodList) {
			vector<string> splitstrs;
			split(strTimePeriod.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				int startMinute = hhmmToMinutes(splitstrs[0].c_str());
				int endMinute = hhmmToMinutes(splitstrs[1].c_str());
				item->timePeriodStartMinutes.emplace_back(startMinute);
				item->timePeriodEndMinutes.emplace_back(endMinute);
			}
		}
	}
	if (jsonItem.HasMember("attainedQual")) item->attainedQual = jsonItem["attainedQual"].GetString();
	if (jsonItem.HasMember("needObs")) item->needObs = (jsonItem["needObs"].GetInt() == 1);
	if (jsonItem.HasMember("needPip")) item->needPip = (jsonItem["needPip"].GetInt() == 1);

	if (jsonItem.HasMember("pipNumber")) item->pipNumber = jsonItem["pipNumber"].GetInt();
	if (jsonItem.HasMember("pnrNumber")) item->pnrNumber = jsonItem["pnrNumber"].GetInt();

	if (jsonItem.HasMember("pnrBase")) {
		item->pnrBase = jsonItem["pnrBase"].GetString();
		item->pnrBases.clear();
		if (!item->pnrBase.empty() && item->pnrBase != "ALL" && item->pnrBase != "*") {
			split(item->pnrBase, '|', item->pnrBases);
		}
	}

	if (jsonItem.HasMember("pnrRank")) {
		item->pnrRank = jsonItem["pnrRank"].GetString();
		item->pnrRanks.clear();
		if (!item->pnrRank.empty() && item->pnrRank != "ALL" && item->pnrRank != "*") {
			split(item->pnrRank, '|', item->pnrRanks);
		}
	}

	if (jsonItem.HasMember("pnrFleet")) {
		item->pnrFleet = jsonItem["pnrFleet"].GetString();
		item->pnrFleets.clear();
		if (!item->pnrFleet.empty() && item->pnrFleet != "ALL" && item->pnrFleet != "*") {
			split(item->pnrFleet, '|', item->pnrFleets);
		}
	}

	if (jsonItem.HasMember("pnrTeam")) {
		item->pnrTeam = jsonItem["pnrTeam"].GetString();
		item->pnrTeams.clear();
		if (!item->pnrTeam.empty() && item->pnrTeam != "ALL" && item->pnrTeam != "*") {
			split(item->pnrTeam, '|', item->pnrTeams);
		}
	}

	if (jsonItem.HasMember("pnrQualOption")) item->pnrQualOption = strToUpper(jsonItem["pnrQualOption"].GetString());
	if (jsonItem.HasMember("pnrQual")) {
		item->pnrQual = jsonItem["pnrQual"].GetString();
		item->pnrQuals.clear();
		if (!item->pnrQual.empty() && item->pnrQual != "*") {
			split(item->pnrQual, '|', item->pnrQuals);
			for (auto& qual : item->pnrQuals) {
				//移除后缀_P_Q
				if (qual.length() > 4) {
					qual.erase(qual.length() - 4, 4);
				}
			}
		}
	}
	
	if (jsonItem.HasMember("teActingRank")) { 
		item->teActingRank = jsonItem["teActingRank"].GetString(); 
		item->teActingRanks.clear();
		if (!item->teActingRank.empty() && item->teActingRank != "*") {
			split(item->teActingRank, '|', item->teActingRanks);
		}
	}
	if (jsonItem.HasMember("teRole")) { 
		item->teRole = jsonItem["teRole"].GetString();
		item->teRoles.clear();
		if (!item->teRole.empty() && item->teRole != "*") {
			split(item->teRole, '|', item->teRoles);
		}
	}
	if (jsonItem.HasMember("teConfigurableCourse")) {
		item->teConfigurableCourse = jsonItem["teConfigurableCourse"].GetString();
	}
	if (jsonItem.HasMember("subIpRole")) {
		item->subIpRole = jsonItem["subIpRole"].GetString();
	}

	if (jsonItem.HasMember("dayOfWeek")) {
		item->strDayOfWeek = jsonItem["dayOfWeek"].GetString();
		item->dayOfWeeks.clear();
		if (!item->strDayOfWeek.empty()) {
			split(item->strDayOfWeek.c_str(), ',', item->dayOfWeeks);
		}
	}
	if (jsonItem.HasMember("trainingDays")) {
		const char* value = jsonItem["trainingDays"].GetString();
		item->trainingDays = (strlen(value) == 0 ? -1 : atoi(value));
	}
	if (jsonItem.HasMember("restDays")) {
		const char* value = jsonItem["restDays"].GetString();
		item->restDays = (strlen(value) == 0 ? -1 : atoi(value));
	}
	if (jsonItem.HasMember("maxHoursPerDay")) {
		const char* value = jsonItem["maxHoursPerDay"].GetString();
		item->maxHoursPerDay = (strlen(value) == 0 ? -1 : atoi(value));
	}
	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramCourseMore(Value& jsonItem) {
	SharedPtr<TmProgramCourseMore> item = std::make_shared<TmProgramCourseMore>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("tmProgramCourseId")) item->tmProgramCourseId = jsonItem["tmProgramCourseId"].GetInt64();
	if (jsonItem.HasMember("tmProgramCoursePnrId")) item->tmProgramCoursePnrId = jsonItem["tmProgramCoursePnrId"].GetInt64();
	if (jsonItem.HasMember("dependence")) item->dependence = jsonItem["dependence"].GetString();
	if (jsonItem.HasMember("minGap")) item->minGap = jsonItem["minGap"].GetInt();
	if (jsonItem.HasMember("maxGap")) item->maxGap = jsonItem["maxGap"].GetInt();
	if (jsonItem.HasMember("legStation")) item->legStation = strToUpper(jsonItem["legStation"].GetString());

	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramCourseMoreLeg(Value& jsonItem) {
	SharedPtr<TmProgramCourseMoreLeg> item = std::make_shared<TmProgramCourseMoreLeg>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("tmProgramCourseId")) item->tmProgramCourseId = jsonItem["tmProgramCourseId"].GetInt64();
	if (jsonItem.HasMember("tmProgramCoursePnrId")) item->tmProgramCoursePnrId = jsonItem["tmProgramCoursePnrId"].GetInt64();
	if (jsonItem.HasMember("tmProgramCourseMoreId")) item->tmProgramCourseMoreId = jsonItem["tmProgramCourseMoreId"].GetInt64();
	if (jsonItem.HasMember("legCategory")) item->legCategory = strToUpper(jsonItem["legCategory"].GetString());
	if (jsonItem.HasMember("legPhase")) {
		item->legPhase = jsonItem["legPhase"].GetString();
		item->legPhases.clear();
		if (!item->legPhase.empty()) {
			split(item->legPhase, '|', item->legPhases);
		}
	}
	if (jsonItem.HasMember("legSector")) item->legSector = jsonItem["legSector"].GetInt();
	if (jsonItem.HasMember("legForce")) item->legForce = strToUpper(jsonItem["legForce"].GetString());
	if (jsonItem.HasMember("legRange")) item->legRange = strToUpper(jsonItem["legRange"].GetString());
	if (jsonItem.HasMember("legBefore")) { 
		item->strLegBefore = jsonItem["legBefore"].GetString(); 
		item->legBefore = atoi(item->strLegBefore.c_str());
	}
	if (jsonItem.HasMember("legAfter")) {
		item->strLegAfter = jsonItem["legAfter"].GetString();
		item->legAfter = atoi(item->strLegAfter.c_str());
	}
	if (jsonItem.HasMember("legStation")) {
		item->legStation = jsonItem["legStation"].GetString();
		item->legStations.clear();
		if (!item->legStation.empty()) {
			split(item->legStation, '|', item->legStations);
		}
	}
	if (jsonItem.HasMember("legGroup")) {
		item->legGroup = jsonItem["legGroup"].GetString();
		item->legGroups.clear();
		if (!item->legGroup.empty()) {
			split(item->legGroup, '|', item->legGroups);
		}
	}
	if (jsonItem.HasMember("legPassenger")) item->legPassenger = strToUpper(jsonItem["legPassenger"].GetString());

	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramCourseInstructor(Value& jsonItem) {
	SharedPtr<TmProgramCourseInstructor> item = std::make_shared<TmProgramCourseInstructor>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programCourseId")) item->programCourseId = jsonItem["programCourseId"].GetInt64();
	if (jsonItem.HasMember("crewId")) item->crewId = jsonItem["crewId"].GetString();
	if (jsonItem.HasMember("role")) item->role = jsonItem["role"].GetString();
	if (jsonItem.HasMember("rosterId")) item->rosterId = jsonItem["rosterId"].GetInt64();
	if (jsonItem.HasMember("rosterGroundId")) item->rosterGroundId = jsonItem["rosterGroundId"].GetInt64();

	if (jsonItem.HasMember("fltId")) item->fltId = jsonItem["fltId"].GetInt64();
	if (jsonItem.HasMember("rfAssignment")) item->rfAssignment = jsonItem["rfAssignment"].GetString();
	
	if (jsonItem.HasMember("groupId")) item->groupId = jsonItem["groupId"].GetString();
	if (jsonItem.HasMember("resourceCode")) item->resourceCode = jsonItem["resourceCode"].GetString();
	if (jsonItem.HasMember("courseId")) item->courseId = jsonItem["courseId"].GetInt64();
	parseFieldTime(item->startTime, jsonItem, "startTime", "9999-12-31");
	parseFieldTime(item->endTime, jsonItem, "endTime", "9999-12-31");
	if (jsonItem.HasMember("publishFlag")) item->publishFlag = jsonItem["publishFlag"].GetInt();

	if (jsonItem.HasMember("subTmProgramCourseId")) item->subTmProgramCourseId = jsonItem["subTmProgramCourseId"].GetInt64();
	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgram(Value& jsonItem) {
	SharedPtr<TmProgram> item = std::make_shared<TmProgram>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("name")) item->name = jsonItem["name"].GetString();
	if (jsonItem.HasMember("programDesc")) item->programDesc = jsonItem["programDesc"].GetString();
	if (jsonItem.HasMember("footprintId")) item->footprintId = jsonItem["footprintId"].GetInt64();
	if (jsonItem.HasMember("recurrentFlag")) item->recurrentFlag = jsonItem["recurrentFlag"].GetInt();
	
	parseFieldTime(item->startDate, jsonItem, "startDate", "9999-12-31");
	parseFieldTime(item->endDate, jsonItem, "endDate", "9999-12-31");

	if (jsonItem.HasMember("status")) item->status = strToUpper(jsonItem["status"].GetString());
	if (jsonItem.HasMember("crewId")) item->crewId = jsonItem["crewId"].GetString();
	if (jsonItem.HasMember("crewName")) item->crewName = jsonItem["crewName"].GetString();
	if (jsonItem.HasMember("buddyType")) item->buddyType = jsonItem["buddyType"].GetInt();
	
	parseFieldTime(item->firstDutyDate, jsonItem, "firstDutyDate", "9999-12-31");
	
	if (jsonItem.HasMember("firstDutyDateId")) item->firstDutyDateId = jsonItem["firstDutyDateId"].GetInt64();
	if (jsonItem.HasMember("firstDutyDateType")) item->firstDutyDateType = jsonItem["firstDutyDateType"].GetString();
	if (jsonItem.HasMember("courseSequence")) item->courseSequence = jsonItem["courseSequence"].GetInt();
	if (jsonItem.HasMember("footprint")) item->footprint = jsonItem["footprint"].GetString();
	if (jsonItem.HasMember("generationMethod")) item->generationMethod = strToUpper(jsonItem["generationMethod"].GetString());

	//if (jsonItem.HasMember("createUser")) item->createUser = jsonItem["createUser"].GetString();
	//parseFieldTime(item->createTime, jsonItem, "createTime");
	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramPip(Value& jsonItem) {
	SharedPtr<TmProgramPip> item = std::make_shared<TmProgramPip>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("simioe")) item->simioe = strToUpper(jsonItem["simioe"].GetString());
	if (jsonItem.HasMember("phase")) {
		item->strPhase = jsonItem["phase"].GetString();
		item->phase.clear();
		if (!item->strPhase.empty() && item->strPhase != "*") {
			split(item->strPhase, '|', item->phase);
		}
	}
	if (jsonItem.HasMember("pipNumber")) item->pipNumber = jsonItem["pipNumber"].GetInt();
	if (jsonItem.HasMember("crewIds")) {
		item->strCrewIds = jsonItem["crewIds"].GetString();
		item->crewIds.clear();
		if (!item->strCrewIds.empty() && item->strCrewIds != "*") {
			split(item->strCrewIds, '|', item->crewIds);
		}
	}


	//if (jsonItem.HasMember("createUser")) item->createUser = jsonItem["createUser"].GetString();
	//parseFieldTime(item->createTime, jsonItem, "createTime");
	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramBuddy(Value& jsonItem) {
	SharedPtr<TmProgramBuddy> item = std::make_shared<TmProgramBuddy>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("tmProgramId")) item->tmProgramId = jsonItem["tmProgramId"].GetInt64();
	if (jsonItem.HasMember("crewId")) item->crewId = jsonItem["crewId"].GetString();
	if (jsonItem.HasMember("buddyId")) item->buddyId = jsonItem["buddyId"].GetString();

	//if (jsonItem.HasMember("createUser")) item->createUser = jsonItem["createUser"].GetString();
	//parseFieldTime(item->createTime, jsonItem, "createTime");
	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramBuddyCourse(Value& jsonItem) {
	SharedPtr<TmProgramBuddyCourse> item = std::make_shared<TmProgramBuddyCourse>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("programId")) item->programId = jsonItem["programId"].GetInt64();
	if (jsonItem.HasMember("courseId")) item->courseId = jsonItem["courseId"].GetInt64();
	if (jsonItem.HasMember("programBuddyId")) item->programBuddyId = jsonItem["programBuddyId"].GetInt64();
	if (jsonItem.HasMember("programBuddyTimeId")) item->programBuddyTimeId = jsonItem["programBuddyTimeId"].GetInt64();

	//if (jsonItem.HasMember("createUser")) item->createUser = jsonItem["createUser"].GetString();
	//parseFieldTime(item->createTime, jsonItem, "createTime");
	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmProgramBuddyTime(Value& jsonItem) {
	SharedPtr<TmProgramBuddyTime> item = std::make_shared<TmProgramBuddyTime>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("tmProgramBuddyId")) item->tmProgramBuddyId = jsonItem["tmProgramBuddyId"].GetInt64();
	if (jsonItem.HasMember("buddyProgramId")) item->buddyProgramId = jsonItem["buddyProgramId"].GetInt64();
	if (jsonItem.HasMember("startTime")) {
		item->startTime = jsonItem["startTime"].GetString();
		if (!item->startTime.empty()) {
			if (isNumberStr(item->startTime.c_str(), item->startTime.length())) {
				item->fromCourseId = atoll(item->startTime.c_str());
			}
			else {
				parseFieldTime(item->courseStartTime, jsonItem, "startTime", "9999-12-31");
			}
		}
	}

	if (jsonItem.HasMember("endTime")) {
		item->endTime = jsonItem["endTime"].GetString();
		if (!item->endTime.empty()) {
			if (isNumberStr(item->endTime.c_str(), item->endTime.length())) {
				item->toCourseId = atoll(item->endTime.c_str());
			}
			else {
				parseFieldTime(item->courseEndTime, jsonItem, "endTime", "9999-12-31");
			}
		}
	}

	if (jsonItem.HasMember("startCoursePhase")) item->startCoursePhase = jsonItem["startCoursePhase"].GetInt();
	if (jsonItem.HasMember("endCoursePhase")) item->endCoursePhase = jsonItem["endCoursePhase"].GetInt();

	//if (jsonItem.HasMember("createUser")) item->createUser = jsonItem["createUser"].GetString();
	//parseFieldTime(item->createTime, jsonItem, "createTime");
	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

SharedPtr<Entity> parseJson_TmDeviceTime(Value& jsonItem) {
	SharedPtr<TmDeviceTime> item = std::make_shared<TmDeviceTime>();

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("resourceCode")) item->resourceCode = jsonItem["resourceCode"].GetString();
	if (jsonItem.HasMember("startTime")) {
		item->startTime = jsonItem["startTime"].GetString();
		item->startTimeMinutes = hhmmToMinutes(item->startTime.c_str());
		item->startTimeMinutes = item->startTimeMinutes < 0 ? 0 : item->startTimeMinutes;
	}
	if (jsonItem.HasMember("endTime")) {
		item->endTime = jsonItem["endTime"].GetString();
		item->endTimeMinutes = hhmmToMinutes(item->endTime.c_str());
		item->endTimeMinutes = item->endTimeMinutes < 0 ? 0 : item->endTimeMinutes;
	}
	if (jsonItem.HasMember("startDate")) {
		item->startDate = jsonItem["startDate"].GetString();
		item->startDateLoc = utcStrToUtc((char*)item->startDate.c_str());
	}
	if (jsonItem.HasMember("endDate")) {
		item->endDate = jsonItem["endDate"].GetString();
		item->endDateLoc = utcStrToUtc((char*)item->endDate.c_str());
	}
	if (jsonItem.HasMember("peopleLimit")) item->peopleLimit = jsonItem["peopleLimit"].GetInt();
	if (jsonItem.HasMember("status")) item->status = strToUpper(jsonItem["status"].GetString());
	if (jsonItem.HasMember("operationReason")) item->operationReason = jsonItem["operationReason"].GetString();

	//parseFieldTime(item->createTime, jsonItem, "createTime");
	//if (jsonItem.HasMember("modifiedBy")) item->modifiedBy = jsonItem["modifiedBy"].GetString();
	//parseFieldTime(item->lastModified, jsonItem, "lastModified");

	return std::static_pointer_cast<Entity>(item);
}

int parseJson_UpdateRosterTraining(rapidjson::Document& document, vector<string>& opList, vector<SharedPtr<Entity>>& itemList) {
	int ret = 0;

	if (!document.IsArray()) {
		Logger::getRuleLogger()->error("ERROR: Input file invalid: content is NOT a json array");
		return ERR_JSON;
	}
	for (SizeType i = 0; i < document.Size(); i++) {
		Value& doc = document[i];
		string activityType = doc.HasMember("activityType") ? string(doc["activityType"].GetString()) : "";
		string operation = doc.HasMember("operation") ? string(doc["operation"].GetString()) : "";
		std::transform(activityType.begin(), activityType.end(), activityType.begin(), ::toupper);
		std::transform(operation.begin(), operation.end(), operation.begin(), ::toupper);

		Value& activityItem = doc.HasMember("activityItem") ? doc["activityItem"] : doc;

		if (activityType == "TMPROGRAMCOURSE") {
			SharedPtr<Entity> item = parseJson_TmProgramCourse(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMCOURSELIMITATION") {
			SharedPtr<Entity> item = parseJson_TmProgramCourseLimitation(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMCOURSEROLE") {
			SharedPtr<Entity> item = parseJson_TmProgramCourseRole(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMCOURSEROLELIMITATION") {
			SharedPtr<Entity> item = parseJson_TmProgramCourseRoleLimitation(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMCOURSEROLEQUAL") {
			SharedPtr<Entity> item = parseJson_TmProgramCourseRoleQual(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMCOURSEIPROLE") {
			SharedPtr<Entity> item = parseJson_TmProgramCourseIpRole(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMCOURSEIPROLEBASE") {
			SharedPtr<Entity> item = parseJson_TmProgramCourseIpRoleBase(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMCOURSEIPROLEQUAL") {
			SharedPtr<Entity> item = parseJson_TmProgramCourseIpRoleQual(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMCOURSEIPCK") {
			SharedPtr<Entity> item = parseJson_TmProgramCourseIpck(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMCOURSEPNR") {
			SharedPtr<Entity> item = parseJson_TmProgramCoursePnr(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMCOURSEMORE") {
			SharedPtr<Entity> item = parseJson_TmProgramCourseMore(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMCOURSEMORELEG") {
			SharedPtr<Entity> item = parseJson_TmProgramCourseMoreLeg(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMCOURSEINSTRUCTOR") {
			SharedPtr<Entity> item = parseJson_TmProgramCourseInstructor(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAM") {
			SharedPtr<Entity> item = parseJson_TmProgram(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMPIP") {
			SharedPtr<Entity> item = parseJson_TmProgramPip(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMBUDDY") {
			SharedPtr<Entity> item = parseJson_TmProgramBuddy(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMBUDDYCOURSE") {
			SharedPtr<Entity> item = parseJson_TmProgramBuddyCourse(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMPROGRAMBUDDYTIME") {
			SharedPtr<Entity> item = parseJson_TmProgramBuddyTime(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
		else if (activityType == "TMDEVICETIME") {
			SharedPtr<Entity> item = parseJson_TmDeviceTime(activityItem);
			opList.push_back(operation);
			itemList.push_back(item);
		}
	}
	return ret;
}