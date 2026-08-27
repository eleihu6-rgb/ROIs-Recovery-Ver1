#include "CalculateWorkingHourInMandayForEvaFdRule.h"
#include <cfloat>
#include <algorithm>
#include <cmath>
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/AssignmentUtils.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "Log/Logger.h"

//获得MandayActivity的Working Hour值
inline static double GetSegmentWorkingHour(const SharedPtr<MandayActivity>& segMandayActivitiy, const string timeType="SCH") {
	time_t startTimeUtc = segMandayActivitiy->getStartTimeUtc(timeType);
	time_t endTimeUtc = segMandayActivitiy->getEndTimeUtc(timeType);

	double duration = segMandayActivitiy->getCalcDuration(timeType) < 0 ? (double)(endTimeUtc - startTimeUtc) : segMandayActivitiy->getCalcDuration(timeType);
	return duration;
}

std::tuple<map<time_t, double>, map<long long, double>> CalculateWorkingHourInMandayForEvaFdRule::Calculate(std::vector<const ROSTER*>& rosters) {
	map<time_t, double> mandayResults;
	map<long long, double> rostersResults;
	if (_ruleParam->Empty() || rosters.empty()) {
		return std::tuple<map<time_t, double>, map<long long, double>>();
	}

	auto iterCrew = this->_dbData->crewIdMap.find(rosters[0]->idcrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return std::tuple<map<time_t, double>, map<long long, double>>();
	}
	std::shared_ptr<CREW> crew = iterCrew->second;
	string crewBase = crew->getPrimeBase();

	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeUtcSch(), crewBase, this->GetDataContext());

	ROSTER* firstDoRoster = nullptr;//每月的第一个DO任务
	vector<SharedPtr<MandayActivity>> crewMandayActivities;
	for (size_t i = 0; i < rosters.size(); i++) {
		const ROSTER* currRoster = rosters[i];
		const ROSTER* nextRoster = (i == (rosters.size() - 1)) ? nullptr : rosters[i+1];

		auto tmpCrewMandayActivities = CalculateWorkingHour(currRoster, nextRoster, crewBase, offsetTZMinutes);
		crewMandayActivities.insert(crewMandayActivities.end(), tmpCrewMandayActivities.begin(), tmpCrewMandayActivities.end());

		//每月的第一个DO，默认计算4小時working hours（硬编码实现）
		if (GetFirstDoOfMonth(firstDoRoster, currRoster, offsetTZMinutes)) {
			auto doMandayActivity = GetWorkingHourActivityForFirstDO(firstDoRoster, offsetTZMinutes);
			crewMandayActivities.emplace_back(doMandayActivity);
		}
	}

	if (crewMandayActivities.empty()) {
		return std::tuple<map<time_t, double>, map<long long, double>>();
	}

	//按天分组MandayActivity数据
	map<time_t, vector<SharedPtr<MandayActivity>>> crewMandayActivitiesMap = MandayActivity::getCrewMandayActivityGroupByDay(crewMandayActivities, this->GetDataContext(), offsetTZMinutes, "SCH");
	for (auto& pair : crewMandayActivitiesMap) {
		//累计每日的Working Hour
		double workingHour = 0;
		for (auto& activity : pair.second) {
			if (activity->getCalcDuration("SCH") < 0) {
				workingHour += static_cast<int>(activity->getCalcEndTimeUtc("SCH") - activity->getCalcStartTimeUtc("SCH"));
			}
			else {
				workingHour += activity->getCalcDuration("SCH");
			}

		}
		mandayResults.insert(std::make_pair(pair.first, workingHour / 60.0)); //Working Hour分钟数
	}

	//按Roster合并MandayActivity数据
	for (auto& activity : crewMandayActivities) {
		long long rosterId = activity->getRosterId();

		double workingHour = 0;
		if (activity->getCalcDuration("SCH") < 0) {
			workingHour = static_cast<int>(activity->getEndTimeUtc("SCH") - activity->getStartTimeUtc("SCH"));
		}
		else {
			workingHour = activity->getCalcDuration("SCH");
		}

		auto iter = rostersResults.find(rosterId);
		if (iter == rostersResults.end()) {
			rostersResults.insert(std::make_pair(rosterId, workingHour));
		}
		else {
			iter->second += workingHour;
		}
	}
	for (auto& pair : rostersResults) {
		auto& workingHour = pair.second;
		pair.second = workingHour / 60;//转成分钟
	}

	return std::make_tuple(mandayResults, rostersResults);
}

vector<SharedPtr<MandayActivity>> CalculateWorkingHourInMandayForEvaFdRule::CalculateWorkingHour(const ROSTER* currRoster, const ROSTER* nextRoster, const string& crewBase, const int offsetTZMinutes) {
	vector<SharedPtr<MandayActivity>> crewMandayActivities;

	if (currRoster->pairing == nullptr) {
		vector<SharedPtr<MandayActivity>> rosterWorkingHourActivity = GetWorkingHourActivityForGroundRoster(currRoster, nextRoster, offsetTZMinutes);
		crewMandayActivities.insert(crewMandayActivities.end(), rosterWorkingHourActivity.begin(), rosterWorkingHourActivity.end());
	}
	else {
		vector<SharedPtr<MandayActivity>> pairingWorkingHourActivity = GetWorkingHourActivityForPairing(currRoster->pairing, currRoster, nextRoster, offsetTZMinutes);
		crewMandayActivities.insert(crewMandayActivities.end(), pairingWorkingHourActivity.begin(), pairingWorkingHourActivity.end());
	}
	return crewMandayActivities;
}


vector<SharedPtr<MandayActivity>> CalculateWorkingHourInMandayForEvaFdRule::GetWorkingHourActivityForPairing(const Pairing* currPairing, const ROSTER* currRoster, const ROSTER* nextRoster, const int offsetTZMinutes) {
	vector<SharedPtr<MandayActivity>> pairingMandayActivities;

	auto& pairingWorkingHourParams = _ruleParam->GetPairingWorkingHourParams();
	for (const auto& duty : currPairing->getDutyVec()) {
		vector<SharedPtr<MandayActivity>> segMandayActivitiesInDuty;
		//if (DutyUtils::containFly(duty)) {
		//	//处理Duty包含飞行，并且Duty Flight Hour小于4:00(Duty Working Hour小于4:00)
		//	auto dutyWorkingHourActivity = GetWorkingHourActivityForFlyDuty(duty);
		//	if (dutyWorkingHourActivity != nullptr) {
		//		dutyWorkingHourActivity->setRosterId(currRoster->rosterId);
		//		//segMandayActivitiesInDuty.emplace_back(dutyWorkingHourActivity);
		//		pairingMandayActivities.emplace_back(dutyWorkingHourActivity);
		//		continue;
		//	}
		//}

		//if (DutyUtils::IsPureDHD(duty)) {
		//	//处理Duty纯DHD，并且Duty Flight Hour大于8:00(Duty Working Hour大于4:00)
		//	auto dutyWorkingHourActivity = GetWorkingHourActivityForPureDHDDuty(duty);
		//	if (dutyWorkingHourActivity != nullptr) {
		//		dutyWorkingHourActivity->setRosterId(currRoster->rosterId);
		//		//segMandayActivitiesInDuty.emplace_back(dutyWorkingHourActivity);
		//		pairingMandayActivities.emplace_back(dutyWorkingHourActivity);
		//		continue;
		//	}
		//}
		bool prevSegmentSIM = false, currSegmentSIM = false;//前一个Segment和当前Segment 是不是SIM
		for (size_t i = 0; i < duty->getNumSegments(); i++) {
			const Segment* currSegment = duty->getSegment(i);
			const Segment* nextSegment = (i == (duty->getNumSegments() - 1)) ? nullptr : duty->getSegment(i + 1);

			currSegmentSIM = SegmentUtils::IsSIM(currSegment);
			for (const auto& ruleParam : pairingWorkingHourParams) {
				if (ruleParam.MatchParam(currPairing, duty, currSegment, nextSegment, currRoster, nextRoster, offsetTZMinutes)) {
					SharedPtr<MandayActivity> segmentWorkingHourActivity = GetWorkingHourActivityForSegment(duty, currSegment, currRoster, offsetTZMinutes, prevSegmentSIM, currSegmentSIM, ruleParam);
					if (segmentWorkingHourActivity != nullptr) {
						segmentWorkingHourActivity->setRosterId(currRoster->rosterId);
						segMandayActivitiesInDuty.emplace_back(segmentWorkingHourActivity);
					}
					break;
				}
			}
			prevSegmentSIM = currSegmentSIM;
		}
		
		//特殊处理场景1：Duty中PNC/DHD航段的特殊处理，PNC(DHD)航段与其他类型航段组合，若其他类型航段WH=0,则PNC(DHD)航段=0
		GetWorkingHourActivityForSpecialDHD(segMandayActivitiesInDuty);
		
		//通过Duty Min Working Hour检查，是否需要合并Duty
		if (!segMandayActivitiesInDuty.empty()) {
			segMandayActivitiesInDuty = GetWorkingHourActivityForDuty(duty, currRoster, offsetTZMinutes, segMandayActivitiesInDuty);
			pairingMandayActivities.insert(pairingMandayActivities.end(), segMandayActivitiesInDuty.begin(), segMandayActivitiesInDuty.end());
		}
	}
	return pairingMandayActivities;
}


vector<SharedPtr<MandayActivity>> CalculateWorkingHourInMandayForEvaFdRule::GetWorkingHourActivityForGroundRoster(const ROSTER* currRoster, const ROSTER* nextRoster, const int offsetTZMinutes) {
	vector<SharedPtr<MandayActivity>> crewMandayActivities;

	auto& groundRosterWorkingHourParams = _ruleParam->GetGroundRosterWorkingHourForEvaFdRuleParams();
	for (const auto& ruleParam : groundRosterWorkingHourParams) {
		if (ruleParam.MatchParam(currRoster, nextRoster)) {
			SharedPtr<MandayActivity> rosterWorkingHourActivity = GetWorkingHourActivityForGroundRoster(currRoster, offsetTZMinutes, ruleParam);
			if (rosterWorkingHourActivity != nullptr) {
				rosterWorkingHourActivity->setRosterId(currRoster->rosterId);
				crewMandayActivities.emplace_back(rosterWorkingHourActivity);
			}
			break;
		}
	}
	return crewMandayActivities;
}

SharedPtr<MandayActivity> CalculateWorkingHourInMandayForEvaFdRule::GetWorkingHourActivityForGroundRoster(const ROSTER* roster, const int offsetTZMinutes, const GroundRosterWorkingHourForEvaFdRuleParam& ruleParam) {
	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::WORKING_HOUR);
	if (ruleParam._whExpressionMinutes == nullptr) {
		if (ruleParam._whExpression == "BT") {
			activity->setStartTimeUtcSch(roster->getStartTimeUtcSch());
			activity->setEndTimeUtcSch(roster->getRestStartUtcSch());
			activity->setStartTimeUtcAct(roster->getStartTimeUtcAct());
			activity->setEndTimeUtcAct(roster->getRestStartUtcAct());
		}
		else {
			Logger::getRuleLogger()->error("[GetWorkingHourActivityForGroundRoster] Working hour expression({}) is not supported.", ruleParam._whExpression);
		}
	}
	else {
		//固定时长
		activity->setStartTimeUtcSch(roster->getStartTimeUtcSch());
		activity->setEndTimeUtcSch(roster->getRestStartUtcSch());
		activity->setStartTimeUtcAct(roster->getStartTimeUtcAct());
		activity->setEndTimeUtcAct(roster->getRestStartUtcAct());

		int duration = (*ruleParam._whExpressionMinutes) * 60;
		activity->setCalcDuration(duration, "SCH");
	}
	if (activity != nullptr) {
		activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
		activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
		activity->setRosterId(roster->rosterId);
	}
	return activity;
}

SharedPtr<MandayActivity> CalculateWorkingHourInMandayForEvaFdRule::GetWorkingHourActivityForFlyDuty(const Duty* duty) const {
	int minWHInSec = GetMinWorkingHourForPureFlyDuty() * 60;
	int dutyFlightHour = GetFlightHourForDuty(duty);
	if (dutyFlightHour < minWHInSec) {
		//若Duty的飞时小于4小时，则Duty Working Hour = 4:00
		SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::WORKING_HOUR);
		activity->setStartTimeUtcSch(duty->getStartTimeUtcSch());
		activity->setEndTimeUtcSch(duty->getEndTimeUtcSch());
		activity->setStartTimeUtcAct(duty->getStartTimeUtcAct());
		activity->setEndTimeUtcAct(duty->getEndTimeUtcAct());
		activity->setPairingId(duty->getPairingId());
		activity->setDutyId(duty->getDutyId());
		activity->setCalcDuration(minWHInSec, "SCH");//单位：秒
		activity->setSplitMethod("AVG");//如果Duty出现跨天，则平分
		return activity;
	}

	return nullptr;
}

SharedPtr<MandayActivity> CalculateWorkingHourInMandayForEvaFdRule::GetWorkingHourActivityForPureDHDDuty(const Duty* duty) const  {
	//vector<SharedPtr<MandayActivity>> activities;

	//PNC計算方法由原本的Min(OPR/2, 4) 改為 Max (OPR/2, 3)
	// 原算法：Min(OPR/2, 4)
	//int maxWHInSec = GetMaxWorkingHourForPureDhdDuty() * 60;
	//int dutyFlightHour = GetFlightHourForDuty(duty);//单位：秒
	//if (dutyFlightHour > 2 * maxWHInSec) {
	//	//若Duty的飞时小于4小时，则Duty Working Hour = 4:00
	//	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::WORKING_HOUR);
	//	activity->setStartTimeUtcSch(duty->getStartTimeUtcSch());
	//	activity->setEndTimeUtcSch(duty->getEndTimeUtcSch());
	//	activity->setStartTimeUtcAct(duty->getStartTimeUtcAct());
	//	activity->setEndTimeUtcAct(duty->getEndTimeUtcAct());
	//	activity->setPairingId(duty->getPairingId());
	//	activity->setDutyId(duty->getDutyId());
	//	activity->setCalcDuration(maxWHInSec, "SCH");//单位：秒
	//	activity->setSplitMethod("AVG");//如果Duty出现跨天，则平分
	//	return activity;
	//}

	//新算法： Max (OPR/2, 3)，不需要特殊处理，采用通用方法处理，这里直接返回nullptr
	return nullptr;
}

SharedPtr<MandayActivity> CalculateWorkingHourInMandayForEvaFdRule::GetWorkingHourActivityForSegment(const Duty* duty, const Segment* segment, const ROSTER* roster, const int offsetTZMinutes, const bool prevSegmentSIM, const bool currSegmentSIM, const PairingWorkingHourForEvaFdRuleParam& ruleParam) const {
	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::WORKING_HOUR);
	if (ruleParam._whExpressionMinutes == nullptr) {

		if (ruleParam._whExpression == "BT") {
			activity->setStartTimeUtcSch(segment->getStartTimeUtcSch());
			activity->setEndTimeUtcSch(segment->getEndTimeUtcSch());
			activity->setStartTimeUtcAct(segment->getStartTimeUtcAct());
			activity->setEndTimeUtcAct(segment->getEndTimeUtcAct());
			activity->setAssignment(segment->getAssignment());

			activity->setDutyMinWorkingHour(ruleParam._whMinDutyMinutes == nullptr ? - 1 : *ruleParam._whMinDutyMinutes);

			int duration = static_cast<int>(segment->getEndTimeUtcSch() - segment->getStartTimeUtcSch());
			if (ruleParam._whPercent != nullptr || ruleParam._whMaxMinutes != nullptr || ruleParam._whMinMinutes != nullptr) {
				activity->setCalcDuration(CalcuateWorkingHour(duration, ruleParam), "SCH");
			}
		}
		else if (ruleParam._whExpression == "ACC") {
			activity->setStartTimeUtcSch(segment->getStartTimeUtcSch());
			activity->setEndTimeUtcSch(segment->getEndTimeUtcSch());
			activity->setStartTimeUtcAct(segment->getStartTimeUtcAct());
			activity->setEndTimeUtcAct(segment->getEndTimeUtcAct());
			activity->setAssignment(segment->getAssignment());
			
			activity->setDutyMinWorkingHour(ruleParam._whMinDutyMinutes == nullptr ? -1 : *ruleParam._whMinDutyMinutes);
			
			double acc = GetAccumulatedWorkingHourForDuty(duty, roster, ruleParam);

			activity->setCalcDuration(CalcuateWorkingHour(acc, ruleParam), "SCH");
		}
		else if (ruleParam._whExpression == "AVG") {
			activity->setStartTimeUtcSch(segment->getStartTimeUtcSch());
			activity->setEndTimeUtcSch(segment->getEndTimeUtcSch());
			activity->setStartTimeUtcAct(segment->getStartTimeUtcAct());
			activity->setEndTimeUtcAct(segment->getEndTimeUtcAct());
			activity->setAssignment(segment->getAssignment());

			activity->setDutyMinWorkingHour(ruleParam._whMinDutyMinutes == nullptr ? -1 : *ruleParam._whMinDutyMinutes);

			double avg = GetAveragedWorkingHourForDuty(duty, roster, ruleParam);
			activity->setCalcDuration(CalcuateWorkingHour(avg, ruleParam), "SCH");
		}
		else if (ruleParam._whExpression == "D-B") {
			activity->setStartTimeUtcSch(duty->getStartTimeUtcSch());
			activity->setEndTimeUtcSch(duty->getEndTimeUtcSch());
			activity->setStartTimeUtcAct(duty->getStartTimeUtcAct());
			activity->setEndTimeUtcAct(duty->getEndTimeUtcAct());
			activity->setAssignment(segment->getAssignment());

			activity->setDutyMinWorkingHour(ruleParam._whMinDutyMinutes == nullptr ? -1 : *ruleParam._whMinDutyMinutes);

			//Duty包含多个航段的SIM 特殊处理
			if (currSegmentSIM && duty->getSegmentsRead().size() > 1) {
				shared_ptr<PairingDutyNode> simBrief = nullptr, simDebrief = nullptr;
				SegmentUtils::GetBriefAndDebriefOfSIM(simBrief, simDebrief, duty, segment->getDBId());

				if (simBrief != nullptr) {
					if ( (simBrief->getType() == "DUTY" && segment->getDBId() == duty->getFirstSegment()->getDBId())
						|| (simBrief->getType() == "SEGMENT" && segment->getDBId() == simBrief->getToSegmentId())) {
						//"当前SIM航段是Duty是第一个航班"或“当前SIM航段前面有签入”，则签入时间计入WorkingHour 
 
						//WorkingHour开始为Brief开始时间
						activity->setStartTimeUtcSch(simBrief->getStartTimeUtcSch());
						activity->setStartTimeUtcAct(simBrief->getStartTimeUtcAct());
					}
					else {
						//WorkingHour开始为航段开始时间
						activity->setStartTimeUtcSch(segment->getStartTimeUtcSch());
						activity->setStartTimeUtcAct(segment->getStartTimeUtcAct());
					}
				}

				if (simDebrief != nullptr) {
					if ( (simDebrief->getType() == "DUTY" && segment->getDBId() == duty->getLastSegment()->getDBId()) 
						|| (simDebrief->getType() == "SEGMENT" && simDebrief->getFromSegmentId() == segment->getDBId())) {
						//"当前SIM航段是Duty是最后一个航班"或“当前SIM航段后续有签出”，则签出时间计入WorkingHour 
						
						//WorkingHour截止为签出结束时间
						activity->setEndTimeUtcSch(simDebrief->getEndTimeUtcSch());
						activity->setEndTimeUtcAct(simDebrief->getEndTimeUtcAct());
					}
					else {
						//WorkingHour截止为航段结束时间
						activity->setEndTimeUtcSch(segment->getEndTimeUtcSch());
						activity->setEndTimeUtcAct(segment->getEndTimeUtcAct());
					}
				}

				////针对SIM Segment处于Duty的中间时(不是头和尾航段)，此时缺少Segment类型的Breif和Debrief，此时Segment开始时间和结束时间 作为D-B时间
				//if ( (segment->getDBId() != duty->getFirstSegment()->getDBId() && segment->getDBId() != duty->getLastSegment()->getDBId()) 
				//	&& simBrief != nullptr && simBrief->getType() == "DUTY" ) {
				//	activity->setStartTimeUtcSch(segment->getStartTimeUtcSch());
				//	activity->setStartTimeUtcAct(segment->getStartTimeUtcAct());
				//	activity->setEndTimeUtcSch(segment->getEndTimeUtcSch());
				//	activity->setEndTimeUtcAct(segment->getEndTimeUtcAct());
				//}

				int duration = static_cast<int>(activity->getEndTimeUtcSch() - activity->getStartTimeUtcSch());
				if (ruleParam._whPercent != nullptr || ruleParam._whMaxMinutes != nullptr || ruleParam._whMinMinutes != nullptr) {
					activity->setCalcDuration(CalcuateWorkingHour(duration, ruleParam), "SCH");
				}
			}
		}
		else if (ruleParam._whExpression == "0") {
			//不计入Working Hour
			activity = nullptr;
		}
		else {
			Logger::getRuleLogger()->error("[GetWorkingHourActivityForSegment] Working hour expression({}) is not supported.", ruleParam._whExpression);
		}
	}
	else {
		//固定时长
		activity->setStartTimeUtcSch(segment->getStartTimeUtcSch());
		activity->setEndTimeUtcSch(segment->getEndTimeUtcSch());
		activity->setStartTimeUtcAct(segment->getStartTimeUtcAct());
		activity->setEndTimeUtcAct(segment->getEndTimeUtcAct());
		activity->setAssignment(segment->getAssignment());

		activity->setDutyMinWorkingHour(ruleParam._whMinDutyMinutes == nullptr ? -1 : *ruleParam._whMinDutyMinutes);

		int duration = (*ruleParam._whExpressionMinutes) * 60;
		if (ruleParam._whPercent != nullptr || ruleParam._whMaxMinutes != nullptr || ruleParam._whMinMinutes != nullptr) {
			activity->setCalcDuration(CalcuateWorkingHour(duration, ruleParam), "SCH");
		}
		else {
			activity->setCalcDuration(duration, "SCH");
		}
	}

	if (activity != nullptr) {
		activity->setSplitMethod(ruleParam._splitMethod);
		activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
		activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
		activity->setPairingId(segment->getPairingId());
		activity->setDutyId(segment->getDutyId());
		activity->setSegmentId(segment->getSegmentId());
	}
	return activity;
}

void CalculateWorkingHourInMandayForEvaFdRule::GetWorkingHourActivityForSpecialDHD(vector<SharedPtr<MandayActivity>>& segMandayActivitiesInDuty, const string timeType) {
	vector<SharedPtr<MandayActivity>> dhdSegMandayActivitiesInDuty;
	static vector<string> dhdAssignments = {"DHD", "PNC"};
	bool hasWH = false;//是否有WH值
	for (auto& segMandayActivity : segMandayActivitiesInDuty) {
		if (std::find(dhdAssignments.begin(), dhdAssignments.end(), segMandayActivity->getAssignment()) != dhdAssignments.end()) {
			dhdSegMandayActivitiesInDuty.emplace_back(segMandayActivity);
		}
		else {
			double duration = GetSegmentWorkingHour(segMandayActivity, timeType);
			if ((int)duration > 0) {
				hasWH = true;
				break;
			}
		}
	}
	if (dhdSegMandayActivitiesInDuty.size() == segMandayActivitiesInDuty.size()) {
		//Duty中航段都是DHD航段（不存在其他类型航段），则退出
		return;
	}
	if (!hasWH) {
		//若其他类型航段WH = 0, 则PNC(DHD)航段 = 0
		for (auto& dhdSegMandayActivity : dhdSegMandayActivitiesInDuty) {
			dhdSegMandayActivity->setCalcDuration(0, timeType);
			dhdSegMandayActivity->setDutyMinWorkingHour(-1);
		}
	}
}

vector<SharedPtr<MandayActivity>> CalculateWorkingHourInMandayForEvaFdRule::GetWorkingHourActivityForDuty(const Duty* duty, const ROSTER* roster, const int offsetTZMinutes, const vector<SharedPtr<MandayActivity>>& segMandayActivitiesInDuty, const string timeType) const {

	//获得Duty的working hour
	double dutyWorkingHourInSec = 0;
	int maxOfMinDutyWorkingHour = -1;
	for (auto& segMandayActivitiy : segMandayActivitiesInDuty) {
		if (segMandayActivitiy->getDutyMinWorkingHour() > maxOfMinDutyWorkingHour) {
			maxOfMinDutyWorkingHour = segMandayActivitiy->getDutyMinWorkingHour();
		}

		//time_t startTimeUtc = segMandayActivitiy->getStartTimeUtc(timeType);
		//time_t endTimeUtc = segMandayActivitiy->getEndTimeUtc(timeType);

		//double duration = segMandayActivitiy->getCalcDuration(timeType) < 0 ? (double)(endTimeUtc - startTimeUtc) : segMandayActivitiy->getCalcDuration(timeType);
		double duration  = GetSegmentWorkingHour(segMandayActivitiy, timeType);
		dutyWorkingHourInSec += duration;
	}

	if (dutyWorkingHourInSec > (maxOfMinDutyWorkingHour * 60)) {
		return segMandayActivitiesInDuty;
	}
	vector<SharedPtr<MandayActivity>> results;
	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::WORKING_HOUR);
	Segment* firstSegment = duty->getFirstSegment();
	Segment* lastSegment = duty->getLastSegment();
	activity->setStartTimeUtcSch(firstSegment->getStartTimeUtcSch());
	activity->setEndTimeUtcSch(lastSegment->getEndTimeUtcSch());
	activity->setStartTimeUtcAct(firstSegment->getStartTimeUtcAct());
	activity->setEndTimeUtcAct(lastSegment->getEndTimeUtcAct());

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

	activity->setPairingId(duty->getPairingId());
	activity->setDutyId(duty->getDutyId());
	activity->setRosterId(roster->rosterId);

	activity->setCalcDuration(maxOfMinDutyWorkingHour * 60, "SCH");//单位：秒
	activity->setSplitMethod("AVG");//如果Duty出现跨天，则平分
	results.emplace_back(activity);
	return results;
}

/*
* 计算每月第一个DO的Working Hour
* @param roster
* @param offsetTZMinutes
* @result 计入Per-Diem时间段MandayActivity对象
*/
SharedPtr<MandayActivity> CalculateWorkingHourInMandayForEvaFdRule::GetWorkingHourActivityForFirstDO(const ROSTER* roster, const int offsetTZMinutes) const {
	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::WORKING_HOUR);

	activity->setStartTimeUtcSch(roster->getStartTimeUtcSch());
	activity->setEndTimeUtcSch(roster->getRestStartUtcSch());
	activity->setStartTimeUtcAct(roster->getStartTimeUtcAct());
	activity->setEndTimeUtcAct(roster->getRestStartUtcAct());

	activity->setCalcDuration(4 * 60 * 60, "SCH");//固定4小时，单位：秒

	if (activity != nullptr) {
		activity->setSplitMethod("SPAN");
		activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
		activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
		activity->setPairingId(-1);
		activity->setDutyId(-1);
		activity->setSegmentId(-1);
		activity->setRosterId(roster->rosterId);
	}
	return activity;
}


/**
* 获得Duty的针对特定Segment的累计Working Hour
*/
double CalculateWorkingHourInMandayForEvaFdRule::GetAccumulatedWorkingHourForDuty(const Duty* duty, const ROSTER* roster, const PairingWorkingHourForEvaFdRuleParam& ruleParam) const {
	int acc = 0;
	for (const auto& segment : duty->getSegments()) {
		if (ruleParam.MatchParam(segment, roster)) {
			int duration = static_cast<int>(segment->getEndTimeUtcSch() - segment->getStartTimeUtcSch());
			acc += duration;
		}
	}
	return acc;
}

/**
* 获得Duty的针对特定Segment的平均Working Hour
*/
double CalculateWorkingHourInMandayForEvaFdRule::GetAveragedWorkingHourForDuty(const Duty* duty, const ROSTER* roster, const PairingWorkingHourForEvaFdRuleParam& ruleParam) const {
	int count = 0;
	int acc = 0;
	for (const auto& segment : duty->getSegments()) {
		if (ruleParam.MatchParam(segment, roster)) {
			int duration = static_cast<int>(segment->getEndTimeUtcSch() - segment->getStartTimeUtcSch());
			acc += duration;
			count++;

		}
	}
	return acc * 1.0 / count;
}

double CalculateWorkingHourInMandayForEvaFdRule::CalcuateWorkingHour(const double duration, const PairingWorkingHourForEvaFdRuleParam& ruleParam) const {
	double workingHour = duration;
	if (ruleParam._whPercent != nullptr) {
		workingHour *= (*ruleParam._whPercent);
	}
	
	if (ruleParam._whMaxMinutes != nullptr) {
		workingHour = std::min(workingHour, (*ruleParam._whMaxMinutes)*60.0 );
	}
	else if (ruleParam._whMinMinutes != nullptr) {
		workingHour = std::max(workingHour, (*ruleParam._whMinMinutes) * 60.0);
	}
	return workingHour;
}

/*
* 获得纯飞行的Duty最小Working Hour值(分钟数)
*/
int CalculateWorkingHourInMandayForEvaFdRule::GetMinWorkingHourForPureFlyDuty() const {
	int minWH = 4 * 60;//默认4小时
	if (this->_dbData->systemParamMap.find("CREW_MIN_WH_FOR_PURE_FLY_DUTY_MINS") != this->_dbData->systemParamMap.end())
		minWH = atoi(this->_dbData->systemParamMap["CREW_MIN_WH_FOR_PURE_FLY_DUTY_MINS"].c_str());
	return minWH;
}

/*
* 获得纯DHD的Duty最大Working Hour值(分钟数)
*/
int CalculateWorkingHourInMandayForEvaFdRule::GetMaxWorkingHourForPureDhdDuty() const {
	int maxWH = 4 * 60;//默认4小时
	if (this->_dbData->systemParamMap.find("CREW_MAX_WH_FOR_PURE_DHD_DUTY_MINS") != this->_dbData->systemParamMap.end())
		maxWH = atoi(this->_dbData->systemParamMap["CREW_MAX_WH_FOR_PURE_DHD_DUTY_MINS"].c_str());
	return maxWH;
}

/*
* 获得Duty的所有航班时长合计(秒数)
*/
int CalculateWorkingHourInMandayForEvaFdRule::GetFlightHourForDuty(const Duty* duty) const {
	int acc = 0;
	set<string> transportAssignments = { "TRAIN","BUS","TAXI","CAR","HSR" };
	for (const auto& segment : duty->getSegments()) {
		int duration = static_cast<int>(segment->getEndTimeUtcSch() - segment->getStartTimeUtcSch());
		if (transportAssignments.find(segment->getAssignment()) != transportAssignments.end()) {
			//高铁按50%折算
			duration = (int)std::ceil(duration * 0.5);
		}
		acc += duration;
	}
	return acc;
}

bool CalculateWorkingHourInMandayForEvaFdRule::GetFirstDoOfMonth(ROSTER*& firstDoRoster, const ROSTER* currRoster, const int offsetTZMinutes) {
	auto& dbData = this->GetDataContext();
	if (!dbData->isAssignmentInGroup(currRoster->qualifier, DefaultAssignmentGroup::DO)) {
		return false;
	}
	if (firstDoRoster == nullptr) {
		firstDoRoster = const_cast<ROSTER*>(currRoster);
		return true;
	}
	if (!TimeUtils::IsSameMonth(firstDoRoster->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60, currRoster->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60)) {
		firstDoRoster = const_cast<ROSTER*>(currRoster);
		return true;
	}
	return false;
}

void CalculateWorkingHourInMandayForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	if (_ruleParam == nullptr) {
		_ruleParam = std::make_unique<WorkingHourForEvaFdRuleParam>(WorkingHourForEvaFdRuleParam(this));
	}
	for (const auto& dbRule : input.dbRules) {
		_ruleParam->ParseParam(dbRule);
	}
	if (!_ruleParam->Empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParam->ParseParam(singleRuleParamString);
	}
}
