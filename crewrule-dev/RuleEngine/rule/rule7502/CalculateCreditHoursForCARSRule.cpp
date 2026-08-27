#include "CalculateCreditHoursForCARSRule.h"
#include <cfloat>
#include <algorithm>
#include <vector>
#include <map>
#include <tuple>
#include <memory>
#include <string>
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/NumberUtils.h"
#include "../utils/RosterUtils.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

inline static void MergeCrewMandayDay(map<time_t, std::tuple<double, double>>& mapCrewMandayDay, const map<time_t, double>& actMapCrewMandayDay, const map<time_t, double>& schMapCrewMandayDay) {
	for (auto& actPair : actMapCrewMandayDay) {
		mapCrewMandayDay[actPair.first] = std::make_tuple(actPair.second, 0);
	}
	for (auto& schPair : schMapCrewMandayDay) {
		auto iter = mapCrewMandayDay.find(schPair.first);
		if (iter == mapCrewMandayDay.end()) {
			mapCrewMandayDay[schPair.first] = std::make_tuple(0, schPair.second);
		}
		else {
			std::get<1>(iter->second) = schPair.second;
		}
	}
}

// resultCrewMandayDay: map<本地时间天,MandayCredit当天时长合计(单位：分钟)>
// allAssignmentMapCrewMandayDay: 通过Assignment分组后的按天切分的credit时长，map<assignment, map<本地时间天, tuple<当天credit时长合计(实际时间),当天credit时长合计(计划时间)>>>
inline static void MergeAssignmentCrewMandayDay(map<time_t, MandayCreditHour> & resultCrewMandayDay, const map<string, map<time_t, std::tuple<double, double>>>& allAssignmentMapCrewMandayDay) {
	for (auto& assignmentMap : allAssignmentMapCrewMandayDay) {
		auto& assignment = assignmentMap.first;
		auto& currAssignmentMapCrewMandayDay = assignmentMap.second;
		for (auto& pair : currAssignmentMapCrewMandayDay) {
			auto& localDay = pair.first;
			auto& assignmentCreditDay = pair.second;
			auto iter = resultCrewMandayDay.find(localDay);
			if (iter == resultCrewMandayDay.end()) {
				MandayCreditHour mandayCredit;
				mandayCredit.actAssCreditInMinsMap.insert(std::make_pair(assignment, std::get<0>(assignmentCreditDay)));
				mandayCredit.schAssCreditInMinsMap.insert(std::make_pair(assignment, std::get<1>(assignmentCreditDay)));
				resultCrewMandayDay.insert(std::make_pair(localDay, mandayCredit));
			}
			else {
				auto& actAssignmentCreditMap = iter->second.actAssCreditInMinsMap;
				auto iter2 = actAssignmentCreditMap.find(assignment);
				if (iter2 == actAssignmentCreditMap.end()) {
					actAssignmentCreditMap.insert(std::make_pair(assignment, std::get<0>(assignmentCreditDay)));//实际时间
				}
				else {
					iter2->second += std::get<0>(assignmentCreditDay);
				}

				auto& schAssignmentCreditMap = iter->second.schAssCreditInMinsMap;
				iter2 = schAssignmentCreditMap.find(assignment);
				if (iter2 == schAssignmentCreditMap.end()) {
					schAssignmentCreditMap.insert(std::make_pair(assignment, std::get<1>(assignmentCreditDay)));//计划时间
				}
				else {
					iter2->second += std::get<1>(assignmentCreditDay);
				}
			}
		}
	}
}

inline static map<string, vector<std::shared_ptr<MandayActivity>>> GetMandayActivitiesByAssignment(const vector<std::shared_ptr<MandayActivity>>& mandayActivities) {
	map<string, vector<std::shared_ptr<MandayActivity>>> assignmentMapMandayActivities;
	for (auto& mandayActivity : mandayActivities) {
		const string& assignment = mandayActivity->getAssignment();
		auto iter = assignmentMapMandayActivities.find(assignment);
		if (iter == assignmentMapMandayActivities.end()) {
			vector<std::shared_ptr<MandayActivity>> tmpMandayActivities;
			tmpMandayActivities.emplace_back(mandayActivity);
			assignmentMapMandayActivities.insert(std::make_pair(assignment, tmpMandayActivities));
		}
		else {
			iter->second.emplace_back(mandayActivity);
		}
	}
	return assignmentMapMandayActivities;
}

inline static void Merge(map<string, map<time_t, std::tuple<double, double>>>& allAssignmentMapCrewMandayDay, const string& assignment, const map<time_t, std::tuple<double, double>>& mapAssignmentMandayDay) {
	auto iterAssignment = allAssignmentMapCrewMandayDay.find(assignment);
	if (iterAssignment == allAssignmentMapCrewMandayDay.end()) {
		allAssignmentMapCrewMandayDay.insert(std::make_pair(assignment, mapAssignmentMandayDay));
	}
	else
	{
		auto& totalAssignmentMapCrewMandayDay = iterAssignment->second;

		for (auto& currPair : mapAssignmentMandayDay) {
			auto iterDay = totalAssignmentMapCrewMandayDay.find(currPair.first);//查询本地日期的Credit(实际时间)和Credit(计划时间)
			if (iterDay == totalAssignmentMapCrewMandayDay.end()) {
				totalAssignmentMapCrewMandayDay.insert_or_assign(currPair.first, currPair.second);
			}
			else {
				std::get<0>(iterDay->second) += std::get<0>(currPair.second);//assignment的Credit(实际时间)
				std::get<1>(iterDay->second) += std::get<1>(currPair.second);//assignment的Credit(计划时间)
			}
		}
	}
}

vector<std::shared_ptr<MandayActivity>> CalculateCreditHoursForCARSRule::GetCreditActivitiesForFixedCH(const vector<const Activity*>& activities, const int offsetTZMinutes, const CreditHoursForCARSRuleParam& ruleParam) {
	vector<std::shared_ptr<MandayActivity>> mandayActivities;
	int durationInSec = ruleParam.GetMinimumCHMinutes() * 60;
	for (auto& activity : activities) {
		std::shared_ptr<MandayActivity> mandayActivity = std::make_shared<MandayActivity>(MandayActivity::Type::CREDIT);

		if (typeid(*activity) == typeid(Segment)) {
			Segment* segment = (Segment*)activity;
			mandayActivity->setPairingId(segment->getPairingId());
			mandayActivity->setDutyId(segment->getDutyId());
			mandayActivity->setSegmentId(segment->getSegmentId());
			mandayActivity->setRosterId(0);
			mandayActivity->setAssignment(segment->getAssignment());

			// 设置时间信息
			mandayActivity->setStartTimeUtcSch(activity->getStartTimeUtcSch());
			mandayActivity->setEndTimeUtcSch(activity->getStartTimeUtcSch() + durationInSec);
			mandayActivity->setStartTimeUtcAct(activity->getStartTimeUtcAct());
			mandayActivity->setEndTimeUtcAct(activity->getStartTimeUtcAct() + durationInSec);

			// // 计算Credit
			// int blkMinutes = static_cast<int>(segment->getBlkTime());
			// int actCredit = CalculateCredit(segment, blkMinutes, offsetTZMinutes, "ACT", ruleParam);
			// int schCredit = CalculateCredit(segment, blkMinutes, offsetTZMinutes, "SCH", ruleParam);

			// // 设置计算时长（转换为秒）
			// mandayActivity->setCalcDuration(actCredit * 60, "ACT");
			// mandayActivity->setCalcDuration(schCredit * 60, "SCH");
		}
		else if (typeid(*activity) == typeid(ROSTER)) {
			ROSTER* roster = (ROSTER*)activity;
			mandayActivity->setPairingId(0);
			mandayActivity->setRosterId(roster->rosterId);
			mandayActivity->setAssignment(roster->qualifier);

			// 设置时间信息
			mandayActivity->setStartTimeUtcSch(roster->getStartTimeUtcSch());
			mandayActivity->setEndTimeUtcSch(roster->getStartTimeUtcSch() + durationInSec);
			mandayActivity->setStartTimeUtcAct(roster->getStartTimeUtcAct());
			mandayActivity->setEndTimeUtcAct(roster->getStartTimeUtcAct() + durationInSec);

			// // 计算Credit
			// int dutyPeriodMinutes = roster->dpMinutes;
			// int actCredit = CalculateCredit(roster, dutyPeriodMinutes, offsetTZMinutes, "ACT", ruleParam);
			// int schCredit = CalculateCredit(roster, dutyPeriodMinutes, offsetTZMinutes, "SCH", ruleParam);

			// // 设置计算时长（转换为秒）
			// mandayActivity->setCalcDuration(actCredit * 60, "ACT");
			// mandayActivity->setCalcDuration(schCredit * 60, "SCH");
		}

		mandayActivities.emplace_back(mandayActivity);
	}

	return mandayActivities;
}

vector<std::shared_ptr<MandayActivity>> CalculateCreditHoursForCARSRule::GetCreditActivitiesForFT(const vector<const Activity*>& activities, const int offsetTZMinutes, const CreditHoursForCARSRuleParam& ruleParam) {
	vector<std::shared_ptr<MandayActivity>> mandayActivities;

	for (auto& activity : activities) {
		std::shared_ptr<MandayActivity> mandayActivity = std::make_shared<MandayActivity>(MandayActivity::Type::CREDIT);

		if (typeid(*activity) == typeid(Segment)) {
			Segment* segment = (Segment*)activity;
			mandayActivity->setPairingId(segment->getPairingId());
			mandayActivity->setDutyId(segment->getDutyId());
			mandayActivity->setSegmentId(segment->getSegmentId());
			mandayActivity->setRosterId(0);
			mandayActivity->setAssignment(segment->getAssignment());

			// 设置时间信息
			mandayActivity->setStartTimeUtcSch(activity->getStartTimeUtcSch());
			mandayActivity->setEndTimeUtcSch(activity->getEndTimeUtcSch());
			mandayActivity->setStartTimeUtcAct(activity->getStartTimeUtcAct());
			mandayActivity->setEndTimeUtcAct(activity->getEndTimeUtcAct());

			// // 计算Credit
			// int blkMinutes = static_cast<int>(segment->getBlkTime());
			// int actCredit = CalculateCredit(segment, blkMinutes, offsetTZMinutes, "ACT", ruleParam);
			// int schCredit = CalculateCredit(segment, blkMinutes, offsetTZMinutes, "SCH", ruleParam);

			// // 设置计算时长（转换为秒）
			// mandayActivity->setCalcDuration(actCredit * 60, "ACT");
			// mandayActivity->setCalcDuration(schCredit * 60, "SCH");
			mandayActivity->setPercent(ruleParam.GetFTRatio());
		}
		else if (typeid(*activity) == typeid(ROSTER)) {
			ROSTER* roster = (ROSTER*)activity;
			mandayActivity->setPairingId(0);
			mandayActivity->setRosterId(roster->rosterId);
			mandayActivity->setAssignment(roster->qualifier);

			// 设置时间信息
			mandayActivity->setStartTimeUtcSch(roster->getStartTimeUtcSch());
			mandayActivity->setEndTimeUtcSch(roster->getRestStartUtcSch());
			mandayActivity->setStartTimeUtcAct(roster->getStartTimeUtcAct());
			mandayActivity->setEndTimeUtcAct(roster->getRestStartUtcAct());

			// // 计算Credit
			// int dutyPeriodMinutes = roster->dpMinutes;
			// int actCredit = CalculateCredit(roster, dutyPeriodMinutes, offsetTZMinutes, "ACT", ruleParam);
			// int schCredit = CalculateCredit(roster, dutyPeriodMinutes, offsetTZMinutes, "SCH", ruleParam);

			// // 设置计算时长（转换为秒）
			// mandayActivity->setCalcDuration(actCredit * 60, "ACT");
			// mandayActivity->setCalcDuration(schCredit * 60, "SCH");

			mandayActivity->setPercent(ruleParam.GetFTRatio());
		}

		mandayActivities.emplace_back(mandayActivity);
	}

	return mandayActivities;
}

vector<std::shared_ptr<MandayActivity>> CalculateCreditHoursForCARSRule::GetCreditActivitiesForDP(const vector<const Activity*>& activities, const int offsetTZMinutes, const CreditHoursForCARSRuleParam& ruleParam) {
	vector<std::shared_ptr<MandayActivity>> mandayActivities;

	for (auto& activity : activities) {
		std::shared_ptr<MandayActivity> mandayActivity = std::make_shared<MandayActivity>(MandayActivity::Type::CREDIT);

		if (typeid(*activity) == typeid(Segment)) {
			Segment* segment = (Segment*)activity;
			mandayActivity->setPairingId(segment->getPairingId());
			mandayActivity->setDutyId(segment->getDutyId());
			mandayActivity->setSegmentId(segment->getSegmentId());
			mandayActivity->setRosterId(0);
			mandayActivity->setAssignment(segment->getAssignment());

			// 设置时间信息
			mandayActivity->setStartTimeUtcSch(activity->getStartTimeUtcSch());
			mandayActivity->setEndTimeUtcSch(activity->getEndTimeUtcSch());
			mandayActivity->setStartTimeUtcAct(activity->getStartTimeUtcAct());
			mandayActivity->setEndTimeUtcAct(activity->getEndTimeUtcAct());

			// // 计算Credit
			// int blkMinutes = static_cast<int>(segment->getBlkTime());
			// int actCredit = CalculateCredit(segment, blkMinutes, offsetTZMinutes, "ACT", ruleParam);
			// int schCredit = CalculateCredit(segment, blkMinutes, offsetTZMinutes, "SCH", ruleParam);

			// // 设置计算时长（转换为秒）
			// mandayActivity->setCalcDuration(actCredit * 60, "ACT");
			// mandayActivity->setCalcDuration(schCredit * 60, "SCH");
			// 设置DP比例
			mandayActivity->setPercent(ruleParam.GetDPRatio());
			
		}
		else if (typeid(*activity) == typeid(ROSTER)) {
			ROSTER* roster = (ROSTER*)activity;
			mandayActivity->setPairingId(0);
			mandayActivity->setRosterId(roster->rosterId);
			mandayActivity->setAssignment(roster->qualifier);

			// 设置时间信息
			mandayActivity->setStartTimeUtcSch(roster->getStartTimeUtcSch());
			mandayActivity->setEndTimeUtcSch(roster->getRestStartUtcSch());
			mandayActivity->setStartTimeUtcAct(roster->getStartTimeUtcAct());
			mandayActivity->setEndTimeUtcAct(roster->getRestStartUtcAct());

			// // 计算Credit
			// int dutyPeriodMinutes = roster->dpMinutes;
			// int actCredit = CalculateCredit(roster, dutyPeriodMinutes, offsetTZMinutes, "ACT", ruleParam);
			// int schCredit = CalculateCredit(roster, dutyPeriodMinutes, offsetTZMinutes, "SCH", ruleParam);

			// // 设置计算时长（转换为秒）
			// mandayActivity->setCalcDuration(actCredit * 60, "ACT");
			// mandayActivity->setCalcDuration(schCredit * 60, "SCH");
						// 设置DP比例
			mandayActivity->setPercent(ruleParam.GetDPRatio());
		}

		mandayActivities.emplace_back(mandayActivity);
	}

	return mandayActivities;
}

// 获取Credit活动列表
vector<std::shared_ptr<MandayActivity>> CalculateCreditHoursForCARSRule::GetCreditActivities(const vector<const Activity*>& activities, const int offsetTZMinutes, const CreditHoursForCARSRuleParam& ruleParam) {
	vector<std::shared_ptr<MandayActivity>> mandayActivities;

	for (auto& activity : activities) {
		std::shared_ptr<MandayActivity> mandayActivity = std::make_shared<MandayActivity>(MandayActivity::Type::CREDIT);

		if (typeid(*activity) == typeid(Segment)) {
			Segment* segment = (Segment*)activity;
			mandayActivity->setPairingId(segment->getPairingId());
			mandayActivity->setDutyId(segment->getDutyId());
			mandayActivity->setSegmentId(segment->getSegmentId());
			mandayActivity->setRosterId(0);
			mandayActivity->setAssignment(segment->getAssignment());

			// 设置时间信息
			mandayActivity->setStartTimeUtcSch(activity->getStartTimeUtcSch());
			mandayActivity->setEndTimeUtcSch(activity->getEndTimeUtcSch());
			mandayActivity->setStartTimeUtcAct(activity->getStartTimeUtcAct());
			mandayActivity->setEndTimeUtcAct(activity->getEndTimeUtcAct());

			// 计算Credit
			int blkMinutes = static_cast<int>(segment->getBlkTime());
			int actCredit = CalculateCredit(segment, blkMinutes, offsetTZMinutes, "ACT", ruleParam);
			int schCredit = CalculateCredit(segment, blkMinutes, offsetTZMinutes, "SCH", ruleParam);

			// 设置计算时长（转换为秒）
			mandayActivity->setCalcDuration(actCredit * 60, "ACT");
			mandayActivity->setCalcDuration(schCredit * 60, "SCH");
		}
		else if (typeid(*activity) == typeid(ROSTER)) {
			ROSTER* roster = (ROSTER*)activity;
			mandayActivity->setPairingId(0);
			mandayActivity->setRosterId(roster->rosterId);
			mandayActivity->setAssignment(roster->qualifier);

			// 设置时间信息
			mandayActivity->setStartTimeUtcSch(roster->getStartTimeUtcSch());
			mandayActivity->setEndTimeUtcSch(roster->getRestStartUtcSch());
			mandayActivity->setStartTimeUtcAct(roster->getStartTimeUtcAct());
			mandayActivity->setEndTimeUtcAct(roster->getRestStartUtcAct());

			// 计算Credit
			int dutyPeriodMinutes = roster->dpMinutes;
			int actCredit = CalculateCredit(roster, dutyPeriodMinutes, offsetTZMinutes, "ACT", ruleParam);
			int schCredit = CalculateCredit(roster, dutyPeriodMinutes, offsetTZMinutes, "SCH", ruleParam);

			// 设置计算时长（转换为秒）
			mandayActivity->setCalcDuration(actCredit * 60, "ACT");
			mandayActivity->setCalcDuration(schCredit * 60, "SCH");
		}

		mandayActivities.emplace_back(mandayActivity);
	}

	return mandayActivities;
}

// 计算按天切分的Credit
map<time_t, std::tuple<double, double>> CalculateCreditHoursForCARSRule::CalculateCreditDay(vector<std::shared_ptr<MandayActivity>>& allSegmentMandayActivities, 
	vector<std::shared_ptr<MandayActivity>>& allGroundRosterMandayActivities, 
	map<string, map<time_t, std::tuple<double, double>>>& allAssignmentMapCrewMandayDay, 
	const vector<const Activity*>& activities, 
	const int offsetTZMinutes, 
	const CreditHoursForCARSRuleParam& ruleParam) {

	map<time_t, std::tuple<double, double>> mapCrewMandayDay;
	vector<std::shared_ptr<MandayActivity>> mandayActivities;
	if (ruleParam.NeedMinimumCH()) {
	 	mandayActivities = GetCreditActivitiesForFixedCH(activities, offsetTZMinutes, ruleParam);
	}
	else if (ruleParam.NeedFTRatio()) {
	 	mandayActivities = GetCreditActivitiesForFT(activities, offsetTZMinutes, ruleParam);
	}
	else if (ruleParam.NeedDPRatio()) {
	 	mandayActivities = GetCreditActivitiesForDP(activities, offsetTZMinutes, ruleParam);
	}

	// 设置跨天切分方式（复用底层 MandayActivity 切分逻辑）：
	// SPAN(默认/空) - credit 按本地日切分；START - credit 全部记到任务开始日
	for (auto& mandayActivity : mandayActivities) {
		mandayActivity->setSplitMethod(ruleParam._splitMethod);
	}

	// 分类添加到不同的活动列表
	for (size_t i = 0; i < activities.size(); ++i) {
		auto& activity = activities[i];
		auto& mandayActivity = mandayActivities[i];
		if (typeid(*activity) == typeid(Segment)) {
			allSegmentMandayActivities.emplace_back(mandayActivity);
		}
		else if (typeid(*activity) == typeid(ROSTER)) {
			allGroundRosterMandayActivities.emplace_back(mandayActivity);
		}
	}

	// 按天分组计算Credit
	auto actMapCrewMandayDay = MandayActivity::getCrewMandayGroupByDay(mandayActivities, this->_dbData, offsetTZMinutes, "ACT");
	auto schMapCrewMandayDay = MandayActivity::getCrewMandayGroupByDay(mandayActivities, this->_dbData, offsetTZMinutes, "SCH");

	// 合并实际时间和计划时间的结果
	MergeCrewMandayDay(mapCrewMandayDay, actMapCrewMandayDay, schMapCrewMandayDay);

	// 按Assignment分组后，单独计算
	auto assignmentMapMandayActivities = GetMandayActivitiesByAssignment(mandayActivities);
	for (auto& pair : assignmentMapMandayActivities) {
		auto& assignment = pair.first;
		auto& tmpMandayActivities = pair.second;

		auto tmpActMapCrewMandayDay = MandayActivity::getCrewMandayGroupByDay(tmpMandayActivities, this->_dbData, offsetTZMinutes, "ACT");
		auto tmpSchMapCrewMandayDay = MandayActivity::getCrewMandayGroupByDay(tmpMandayActivities, this->_dbData, offsetTZMinutes, "SCH");
		
		map<time_t, std::tuple<double, double>> mapAssignmentMandayDay;
		// 将实际时间计算结果和计划时间计算结果合并
		MergeCrewMandayDay(mapAssignmentMandayDay, tmpActMapCrewMandayDay, tmpSchMapCrewMandayDay);
		// 合并到allAssignmentMapCrewMandayDay中
		Merge(allAssignmentMapCrewMandayDay, assignment, mapAssignmentMandayDay);
	}

	return mapCrewMandayDay;
}

// 获取Roster级别的Credit
map<long long, CreditHour> CalculateCreditHoursForCARSRule::GetRosterCredit(const vector<const ROSTER*>& rosters, const int offsetTZMinutes) {
	map<long long, CreditHour> resultRosterCreditMap;

	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			// 地面任务
			for (const auto& ruleParam : _ruleParams) {
				if (ruleParam.MatchParam(roster)) {
					int dutyPeriodMinutes = roster->dpMinutes;
					int actCredit = CalculateCredit(roster, dutyPeriodMinutes, offsetTZMinutes, "ACT", ruleParam);
					int schCredit = CalculateCredit(roster, dutyPeriodMinutes, offsetTZMinutes, "SCH", ruleParam);

					CreditHour rosterCredit;
					rosterCredit.actCreditInMins = actCredit;
					rosterCredit.schCreditInMins = schCredit;
					rosterCredit.rosterId = roster->rosterId;
					resultRosterCreditMap[roster->rosterId] = rosterCredit;
					break;
				}
			}
		}
		else {
			// 配对任务
			int totalActCredit = 0;
			int totalSchCredit = 0;

			for (size_t dutyIdx = 0; dutyIdx < roster->pairing->getNumDuties(); ++dutyIdx) {
				auto duty = roster->pairing->getDuty(dutyIdx);
				for (size_t segIdx = 0; segIdx < duty->getNumSegments(); ++segIdx) {
					auto segment = duty->getSegment(segIdx);
					for (const auto& ruleParam : _ruleParams) {
						if (ruleParam.MatchParam(roster, duty, segment, segIdx)) {
							int dutyPeriodMinutes = static_cast<int>(duty->getDPInSecs() / 60);
							int actCredit = CalculateCredit(segment, dutyPeriodMinutes, offsetTZMinutes, "ACT", ruleParam);
							int schCredit = CalculateCredit(segment, dutyPeriodMinutes, offsetTZMinutes, "SCH", ruleParam);

							totalActCredit += actCredit;
							totalSchCredit += schCredit;
							break;
						}
					}
				}
			}

			if (totalActCredit > 0 || totalSchCredit > 0) {
				CreditHour rosterCredit;
				rosterCredit.actCreditInMins = totalActCredit;
				rosterCredit.schCreditInMins = totalSchCredit;
				rosterCredit.rosterId = roster->rosterId;
				resultRosterCreditMap[roster->rosterId] = rosterCredit;
			}
		}
	}

	return resultRosterCreditMap;
}

// 获取Segment级别的Credit
map<long long, map<long long, CreditHour>> CalculateCreditHoursForCARSRule::GetSegmentCredit(const vector<const ROSTER*>& rosters, const int offsetTZMinutes) {
	map<long long, map<long long, CreditHour>> resultSegmentCreditMap;

	for (auto& roster : rosters) {
		if (roster->pairing != nullptr) {
			map<long long, CreditHour> segmentCreditMap;

			for (size_t dutyIdx = 0; dutyIdx < roster->pairing->getNumDuties(); ++dutyIdx) {
				auto duty = roster->pairing->getDuty(dutyIdx);
				for (size_t segIdx = 0; segIdx < duty->getNumSegments(); ++segIdx) {
					auto segment = duty->getSegment(segIdx);
					for (const auto& ruleParam : _ruleParams) {
						if (ruleParam.MatchParam(roster, duty, segment, segIdx)) {
							int dutyPeriodMinutes = static_cast<int>(duty->getDPInSecs() / 60);
							int actCredit = CalculateCredit(segment, dutyPeriodMinutes, offsetTZMinutes, "ACT", ruleParam);
							int schCredit = CalculateCredit(segment, dutyPeriodMinutes, offsetTZMinutes, "SCH", ruleParam);

							CreditHour segCredit;
							segCredit.actCreditInMins = actCredit;
							segCredit.schCreditInMins = schCredit;
							segCredit.segmentId = segment->getSegmentId();
							segmentCreditMap[segment->getSegmentId()] = segCredit;
							break;
						}
					}
				}
			}

			if (!segmentCreditMap.empty()) {
				resultSegmentCreditMap[roster->rosterId] = segmentCreditMap;
			}
		}
	}

	return resultSegmentCreditMap;
}

std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>> CalculateCreditHoursForCARSRule::Calculate(std::vector<const ROSTER*>& rosters) {
	if (_ruleParams.empty() || rosters.empty()) {
		return std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>>();
	}

	auto iterCrew = this->_dbData->crewIdMap.find(rosters[0]->idcrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>>();
	}
	std::shared_ptr<CREW> crew = iterCrew->second;
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());

	vector<std::shared_ptr<MandayActivity>> allSegmentMandayActivities;
	vector<std::shared_ptr<MandayActivity>> allGroundRosterMandayActivities;
	map<time_t, std::tuple<double, double>> resultCrewMandayDay;
	map<string, map<time_t, std::tuple<double, double>>> allAssignmentMapCrewMandayDay; // 通过Assignment分组后的按天切分的credit时长

	// 按规则的匹配参数进行分组
	map<const RuleParam*, vector<const Activity*>> ruleActivityMap;
	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			for (const auto& ruleParam : _ruleParams) {
				if (ruleParam.MatchParam(roster)) {
					auto iter = ruleActivityMap.find(&ruleParam);
					if (iter == ruleActivityMap.end()) {
						vector<const Activity*> tmpRosters;
						tmpRosters.emplace_back(roster);
						ruleActivityMap.insert(std::make_pair(&ruleParam, tmpRosters));
					}
					else {
						iter->second.emplace_back(roster);
					}
					break;
				}
			}
		}
		else {
			for (size_t dutyIdx = 0; dutyIdx < roster->pairing->getNumDuties(); ++dutyIdx) {
				auto duty = roster->pairing->getDuty(dutyIdx);
				for (size_t segIdx = 0; segIdx < duty->getNumSegments(); ++segIdx) {
					auto segment = duty->getSegment(segIdx);
					for (const auto& ruleParam : _ruleParams) {
						if (ruleParam.MatchParam(roster, duty, segment, segIdx)) {
							auto iter = ruleActivityMap.find(&ruleParam);
							if (iter == ruleActivityMap.end()) {
								vector<const Activity*> tmpSegments;
								tmpSegments.emplace_back(segment);
								ruleActivityMap.insert(std::make_pair(&ruleParam, tmpSegments));
							}
							else {
								iter->second.emplace_back(segment);
							}
							break;
						}
					}
				}
			}
		}
	}

	// 处理每个规则匹配的活动
	for (auto& ruleActivity : ruleActivityMap) {
		auto& activities = ruleActivity.second;
		const auto& ruleParam = *(CreditHoursForCARSRuleParam*)(ruleActivity.first);

		// 计算按天切分的Credit
		auto tmpMapCrewMandayDay = CalculateCreditDay(allSegmentMandayActivities, allGroundRosterMandayActivities, allAssignmentMapCrewMandayDay, activities, offsetTZMinutes, ruleParam);

		// 将结果合并到总结果中
		for (auto& tmpCrewMandayDay : tmpMapCrewMandayDay) {
			auto iterResult = resultCrewMandayDay.find(tmpCrewMandayDay.first);
			if (iterResult == resultCrewMandayDay.end()) {
				resultCrewMandayDay[tmpCrewMandayDay.first] = tmpCrewMandayDay.second;
			}
			else {
				std::get<0>(iterResult->second) += std::get<0>(tmpCrewMandayDay.second);
				std::get<1>(iterResult->second) += std::get<1>(tmpCrewMandayDay.second);
			}
		}
	}

	// 获取Roster和Segment级别的Credit
	map<long long, CreditHour> resultRosterCreditMap = GetRosterCredit(rosters, offsetTZMinutes);
	map<long long, map<long long, CreditHour>> resultSegmentCreditMap = GetSegmentCredit(rosters, offsetTZMinutes);

	// 构建最终的按天Credit结果
	map<time_t, MandayCreditHour> resultMandayCreditHour;
	for (auto& pair : resultCrewMandayDay) {
		MandayCreditHour mandayCredit;
		// 将秒转换为分钟
		mandayCredit.actCreditInMins = std::get<0>(pair.second) / 60;
		mandayCredit.schCreditInMins = std::get<1>(pair.second) / 60;
		resultMandayCreditHour[pair.first] = mandayCredit;
	}

	// allAssignmentMapCrewMandayDay结构转换按localDay合并到resultMandayCreditHour
	MergeAssignmentCrewMandayDay(resultMandayCreditHour, allAssignmentMapCrewMandayDay);

	return std::make_tuple(resultMandayCreditHour, resultRosterCreditMap, resultSegmentCreditMap);
}

int CalculateCreditHoursForCARSRule::CalculateCredit(const Segment* segment, int dutyPeriodMinutes, const int offsetTZMinutes, const std::string& timeType, const CreditHoursForCARSRuleParam& ruleParam) {
	// 默认最小信用小时为4小时（240分钟）
	int minCHCredit = 0;
	if (ruleParam.NeedMinimumCH()) {
		minCHCredit = ruleParam.GetMinimumCHMinutes();
	} else {
		minCHCredit = 240; // 默认4小时 = 240分钟
	}

	int ftCredit = CalculateCreditByFltHours(segment, timeType, ruleParam);

	int dpCredit = 0;
	if (ruleParam.NeedDPRatio() && dutyPeriodMinutes > 0) {
		dpCredit = static_cast<int>(dutyPeriodMinutes * ruleParam.GetDPRatio());
	}

	// 取三个值的最大值：最小信用小时、飞时*比率、执勤时间*比率
	return std::max({ minCHCredit, ftCredit, dpCredit });
}

int CalculateCreditHoursForCARSRule::CalculateCredit(const ROSTER* roster, int dutyPeriodMinutes, const int offsetTZMinutes, const std::string& timeType, const CreditHoursForCARSRuleParam& ruleParam) {
	// 默认最小信用小时为4小时（240分钟）
	int minCHCredit = 0;
	if (ruleParam.NeedMinimumCH()) {
		minCHCredit = ruleParam.GetMinimumCHMinutes();
	} else {
		minCHCredit = 240; // 默认4小时 = 240分钟
	}

	int dpCredit = 0;
	if (ruleParam.NeedDPRatio() && dutyPeriodMinutes > 0) {
		dpCredit = static_cast<int>(dutyPeriodMinutes * ruleParam.GetDPRatio());
	}

	// 对于地面任务，取最小信用小时和DP*比率的最大值
	return std::max(minCHCredit, dpCredit);
}

int CalculateCreditHoursForCARSRule::CalculateCreditByFltHours(const Segment* segment, const std::string& timeType, const CreditHoursForCARSRuleParam& ruleParam) {
	if (!ruleParam.NeedFTRatio()) {
		return 0;
	}

	int fltHoursMinutes = GetFlightHoursMinutes(segment, timeType);
	return static_cast<int>(fltHoursMinutes * ruleParam.GetFTRatio());
}

int CalculateCreditHoursForCARSRule::GetFlightHoursMinutes(const Segment* segment, const std::string& timeType) {
	if (timeType == "ACT") {
		return segment->getBlkMinutes();
	}
	else {
		return segment->getBlkMinutes();
	}
}

int CalculateCreditHoursForCARSRule::GetGroundDurationMinutes(const ROSTER* roster, const std::string& timeType) {
	if (timeType == "ACT") {
		return static_cast<int>((roster->getRestStartUtcAct() - roster->getStartTimeUtcAct()) / 60);
	}
	else {
		return static_cast<int>((roster->getRestStartUtcSch() - roster->getStartTimeUtcSch()) / 60);
	}
}

void CalculateCreditHoursForCARSRule::ParseParam(const InputType& input) {
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CreditHoursForCARSRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CreditHoursForCARSRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}