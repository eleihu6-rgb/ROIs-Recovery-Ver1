#include "CalculatePerDiemHoursInMandayForEvaFdRule.h"
#include <cfloat>
#include <algorithm>
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "index/TmProgramIndex.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/SchDutyUtils.h"
#include "../utils/AssignmentUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "RuleParams.h"
#include "../constant/Constants.h"


const int LONG_PERDIEM = 1;

//返回值：map<localDay,std::tuple<当天的PerDiem(分钟数), 当天的Long PerDiem(分钟数)>>
inline static map<time_t, MandayPerDiem> GetMandayResults(const vector<SharedPtr<MandayActivity>>& crewMandayActivities, const SharedPtr<CrewDataContext>& dbData, const int offsetTZMinutes, const string timeType) {
	map<time_t, MandayPerDiem> mandayResults;

	//按天分组MandayActivity数据
	map<time_t, vector<SharedPtr<MandayActivity>>> crewMandayActivitiesMap = MandayActivity::getCrewMandayActivityGroupByDay(crewMandayActivities, dbData, offsetTZMinutes, timeType);
	for (auto& pair : crewMandayActivitiesMap) {
		//累计每日的Per Diem
		double perDiem = 0;
		for (auto& activity : pair.second) {
			if (activity->getCalcDuration(timeType) < 0) {
				perDiem += static_cast<double>(activity->getCalcEndTimeUtc(timeType) - activity->getCalcStartTimeUtc(timeType));
			}
			else {
				perDiem += activity->getCalcDuration(timeType);
			}
		}
		MandayPerDiem mandayPerDiem;
		mandayPerDiem.setPerDiemInMins(perDiem / 60.0, timeType);
		mandayPerDiem.setLongPerDiemInMins(0, timeType);
		mandayResults.insert(std::make_pair(pair.first, mandayPerDiem));
	}


	//获得Long Perdiem数据，在按天分组。需要合并到mandayResults
	vector<SharedPtr<MandayActivity>> crewLongPerdiemMandayActivities;
	for (auto& activity : crewMandayActivities) {
		if (activity->getSubType() == LONG_PERDIEM) {
			crewLongPerdiemMandayActivities.emplace_back(activity);
		}
	}
	map<time_t, vector<SharedPtr<MandayActivity>>> crewLongPerdiemMandayActivitiesMap = MandayActivity::getCrewMandayActivityGroupByDay(crewLongPerdiemMandayActivities, dbData, offsetTZMinutes, timeType);
	for (auto& pair : crewLongPerdiemMandayActivitiesMap) {
		//累计每日的Long Per Diem
		double perDiem = 0;
		for (auto& activity : pair.second) {
			if (activity->getCalcDuration(timeType) < 0) {
				perDiem += static_cast<double>(activity->getCalcEndTimeUtc(timeType) - activity->getCalcStartTimeUtc(timeType));
			}
			else {
				perDiem += activity->getCalcDuration(timeType);
			}
		}
		auto iter = mandayResults.find(pair.first);
		if (iter != mandayResults.end()) {
			auto& mandayPerDiem = iter->second;
			mandayPerDiem.setLongPerDiemInMins(perDiem / 60.0, timeType); //Long perDiem分钟数
		}
	}

	return mandayResults;
}

inline static map<time_t, MandayPerDiem> GetMandayResults(const vector<SharedPtr<MandayActivity>>& crewMandayActivities, const SharedPtr<CrewDataContext>& dbData, const int offsetTZMinutes) {
	auto mandayResults = GetMandayResults(crewMandayActivities, dbData, offsetTZMinutes, "ACT");
	auto schMandayResults = GetMandayResults(crewMandayActivities, dbData, offsetTZMinutes, "SCH");

	for (auto& schPair : schMandayResults) {
		auto schDateLoc = schPair.first;
		auto& schMandayPerDiem = schPair.second;
		auto iter = mandayResults.find(schDateLoc);
		if (iter == mandayResults.end()) {
			MandayPerDiem mandayPerDiem;
			mandayPerDiem.schPerDiemInMins = schMandayPerDiem.schPerDiemInMins;
			mandayPerDiem.schLongPerDiemInMins = schMandayPerDiem.schLongPerDiemInMins;
			mandayResults.insert(std::make_pair(schDateLoc, mandayPerDiem));
		}
		else {
			auto& mandayPerDiem = iter->second;
			mandayPerDiem.schPerDiemInMins = schMandayPerDiem.schPerDiemInMins;
			mandayPerDiem.schLongPerDiemInMins = schMandayPerDiem.schLongPerDiemInMins;
		}
	}

	return mandayResults;
}

//返回值：map<rosterId, PerDiem>
inline static map<long long, PerDiem> GetRosterResults(const vector<SharedPtr<MandayActivity>>& crewMandayActivities, const vector<SharedPtr<MandayActivity>>& halfPairingMandayActivities,  const SharedPtr<CrewDataContext>& dbData, const int offsetTZMinutes, const string timeType) {
	map<long long, PerDiem> rostersResults;

	vector<SharedPtr<MandayActivity>> tmpCrewMandayActivities = crewMandayActivities;
	tmpCrewMandayActivities.insert(tmpCrewMandayActivities.end(), halfPairingMandayActivities.begin(), halfPairingMandayActivities.end());

	unordered_map<long long, vector<SharedPtr<MandayActivity>>> rosterMap; //map<rosterId, SharedPtr<MandayActivity>>
	for (auto& activity : tmpCrewMandayActivities) {
		auto rosterId = activity->getRosterId();
		if (rosterId == 0) {
			continue;
		}
		auto iter = rosterMap.find(rosterId);
		if (iter == rosterMap.end()) {
			vector<SharedPtr<MandayActivity>> activities;
			activities.emplace_back(activity);
			rosterMap.insert(std::make_pair(rosterId, activities));
		}
		else {
			iter->second.emplace_back(activity);
		}
	}
	
	for (auto& pair : rosterMap) {
		auto& rosterId = pair.first;
		auto& activities = pair.second;
		int perDiemInSec = 0;
		int longPerDiemInSec = 0;
		int firstMonthPerDiemInSec = 0;
		int firstMonthLongPerDiemInSec = 0;

		time_t firstMonthStartTimeUtc = activities[0]->getStartTimeUtc(timeType);	//第一个月开始时间
		for (auto& activity : activities) {
			time_t startTimeUtc = activity->getStartTimeUtc(timeType);
			time_t endTimeUtc = activity->getEndTimeUtc(timeType);
			double calcDuration = activity->getCalcDuration(timeType);

			double duration = calcDuration < 0 ? (double)(endTimeUtc - startTimeUtc) : activity->getCalcDuration(timeType);
			perDiemInSec += (int)duration;
			if (activity->getSubType() == LONG_PERDIEM) {
				longPerDiemInSec += (int)duration;
			}

			if (calcDuration < 0) {//固定时长计算不进行跨月切分，累计到开始时间所在月中
				if (TimeUtils::IsSameMonth(startTimeUtc, firstMonthStartTimeUtc, offsetTZMinutes) && TimeUtils::IsSameMonth(startTimeUtc, endTimeUtc, offsetTZMinutes)) {
					//场景1: startTimeUtc和endTimeUtc在首月firstMonth
					firstMonthPerDiemInSec += static_cast<int>(endTimeUtc - startTimeUtc);

					if (activity->getSubType() == LONG_PERDIEM) {
						firstMonthLongPerDiemInSec += static_cast<int>(endTimeUtc - startTimeUtc);
					}
				}
				else if (TimeUtils::IsSameMonth(startTimeUtc, firstMonthStartTimeUtc, offsetTZMinutes) && !TimeUtils::IsSameMonth(startTimeUtc, endTimeUtc, offsetTZMinutes)) {
					//场景2: startTimeUtc在首月firstMonth，endTimeUtc在第二个月

					//"开始时间"和"结束时间"不在一个月，获得“结束时间”所在月份的第一个天0点（即所在月份开始时间）
					time_t monthStartInUtc = Utility::GetInstancePtr()->getLocalMonthStartInUTC(endTimeUtc, offsetTZMinutes);
					firstMonthPerDiemInSec += static_cast<int>(monthStartInUtc - startTimeUtc);

					if (activity->getSubType() == LONG_PERDIEM) {
						firstMonthLongPerDiemInSec += static_cast<int>(monthStartInUtc - startTimeUtc);
					}
				}
			}
		}
		PerDiem perDiem(timeType, perDiemInSec, longPerDiemInSec, firstMonthPerDiemInSec, firstMonthLongPerDiemInSec);
		rostersResults.insert(std::make_pair(rosterId, perDiem));
	}

	return rostersResults;
}

inline static map<long long, PerDiem> GetRosterResults(const vector<SharedPtr<MandayActivity>>& crewMandayActivities, const vector<SharedPtr<MandayActivity>>& halfPairingMandayActivities, const SharedPtr<CrewDataContext>& dbData, const int offsetTZMinutes) {
	auto rosterResults = GetRosterResults(crewMandayActivities, halfPairingMandayActivities, dbData, offsetTZMinutes, "ACT");
	auto schRosterResults = GetRosterResults(crewMandayActivities, halfPairingMandayActivities, dbData, offsetTZMinutes, "SCH");

	for (auto& schPair : schRosterResults) {
		auto rosterId = schPair.first;
		auto& schPerDiem = schPair.second;
		auto iter = rosterResults.find(rosterId);
		if (iter == rosterResults.end()) {
			PerDiem perDiem;
			perDiem.schPerDiemInSec = schPerDiem.schPerDiemInSec;
			perDiem.schFirstMonthPerDiemInSec = schPerDiem.schFirstMonthPerDiemInSec;
			perDiem.schLongPerDiemInSec = schPerDiem.schLongPerDiemInSec;
			perDiem.schFirstMonthLongPerDiemInSec = schPerDiem.schFirstMonthLongPerDiemInSec;
			rosterResults.insert(std::make_pair(rosterId, perDiem));
		}
		else {
			auto& perDiem = iter->second;
			perDiem.schPerDiemInSec = schPerDiem.schPerDiemInSec;
			perDiem.schFirstMonthPerDiemInSec = schPerDiem.schFirstMonthPerDiemInSec;
			perDiem.schLongPerDiemInSec = schPerDiem.schLongPerDiemInSec;
			perDiem.schFirstMonthLongPerDiemInSec = schPerDiem.schFirstMonthLongPerDiemInSec;
		}
	}

	return rosterResults;
}

inline static time_t GetHeadPairingEndMonthUtc(const Pairing* headPairing, const int offsetTZMinutes, const string timeType) {
	time_t endTimeUtc = (timeType == "ACT") ? headPairing->getLastDuty()->getEndTimeUtcAct() : SchDutyUtils::GetDutySchEndTimeUtc(headPairing->getLastDuty(), true);
	time_t headPairingEndMonth = TimeUtils::Truncate(TimeUtils::AddMonth(endTimeUtc, offsetTZMinutes, 1), offsetTZMinutes, ChronoUnit::MONTHS);
	return headPairingEndMonth;
}

inline static time_t GetTailPairingMonthFirstDayUtc(const Pairing* tailPairing, const int offsetTZMinutes, const string timeType) {
	time_t startTimeUtc = (timeType == "ACT") ? tailPairing->getFirstDuty()->getStartTimeUtcAct() : SchDutyUtils::GetDutySchStartTimeUtc(tailPairing->getFirstDuty(), true);
	time_t tailPairingMonthFirstDayUtc = TimeUtils::Truncate(startTimeUtc, offsetTZMinutes, ChronoUnit::MONTHS);
	return tailPairingMonthFirstDayUtc;
}

inline static bool checkOnlyTailPairingRangeInUtcAct(const SharedPtr<MandayActivity>& activity, const Pairing* tailPairing, const time_t tailPairingMonthFirstDayUtcAct) {
	return activity->getEndTimeUtcAct() >= tailPairingMonthFirstDayUtcAct && activity->getEndTimeUtcAct() <= tailPairing->getFirstDuty()->getStartTimeUtcAct();
}

std::tuple<map<time_t, MandayPerDiem>, map<long long, PerDiem>> CalculatePerDiemHoursInMandayForEvaFdRule::Calculate(std::vector<const ROSTER*>& rosters) {
	if (_ruleParams.empty() || rosters.empty()) {
		return std::tuple<map<time_t, MandayPerDiem>, map<long long, PerDiem>>();
	}

	auto iterCrew = this->_dbData->crewIdMap.find(rosters[0]->idcrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return std::tuple<map<time_t, MandayPerDiem>, map<long long, PerDiem>>();
	}
	std::shared_ptr<CREW> crew = iterCrew->second;
	string crewBase = crew->getPrimeBase();

	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeUtcAct(), crewBase, this->GetDataContext());

	vector<SharedPtr<MandayActivity>> crewMandayActivities;
	map<long long, string> dutyTimeTypeMap;//map<dutyId,TimeType>记录计算实际PerDiem时，Duty使用的时间类型(计划时间或实际时间）
	HalfPairing halfPairing;
	bool cleanOnlyTailPairingFlag = false;//场景仅后半环，清除后半环前面的perdeim计算，避免重复计算
	for (auto& roster : rosters) {
		auto tmpCrewMandayActivities = CalculatePerDiem(roster, crewBase, offsetTZMinutes, halfPairing, dutyTimeTypeMap);
		if (!cleanOnlyTailPairingFlag && halfPairing.headPairing == nullptr && halfPairing.tailPairing != nullptr) {
			//场景中仅有商务机后半段环，为了避免重复计算，前面累计到crewMandayActivities中需要全部清除掉
			halfPairing.halfPairingMandayActivities.insert(halfPairing.halfPairingMandayActivities.end(), crewMandayActivities.begin(), crewMandayActivities.end());
			crewMandayActivities.clear();
			cleanOnlyTailPairingFlag = true;
		}
		crewMandayActivities.insert(crewMandayActivities.end(), tmpCrewMandayActivities.begin(), tmpCrewMandayActivities.end());
	}

	//针对半环处理
	if (halfPairing.headPairing != nullptr && halfPairing.tailPairing == nullptr) {
		//半环场景1：整个场景时间段仅包含半环的前段
		
		//整个场景时间段仅包含半环的前段时，从最后一个排班Roster结束时间到前段所在月的月底计入PH
		auto tmpCrewMandayActivity = GetPerDiemActivityBetweenHeadPairingAndMonthEndDay(halfPairing.headPairing, halfPairing.isLongPerDiemDutyForHeadPairing, offsetTZMinutes, dutyTimeTypeMap);
		if (tmpCrewMandayActivity != nullptr) 
			crewMandayActivities.emplace_back(tmpCrewMandayActivity);
	}
	else if (halfPairing.headPairing == nullptr && halfPairing.tailPairing != nullptr) {
		//半环场景2：整个场景时间段仅包含半环的后段
		
		//将从商务机的“后半环所在月首日”到第一个排班Roster开始时间之间，移动到halfPairingMandayActivities中，避免重复计算
		time_t tailPairingMonthFirstDayUtcAct = GetTailPairingMonthFirstDayUtc(halfPairing.tailPairing, offsetTZMinutes, "ACT");

		// 用于存储满足条件元素的新 vector
		vector<SharedPtr<MandayActivity>> missingMandayActivities;//Pairing若跨“后半环所在月首日”，需要重新补回到crewMandayActivities

		for (auto& activity : crewMandayActivities) {
			//if (activity->getEndTimeLocAct() >= tailPairingMonthFirstDayUtcAct && activity->getEndTimeLocAct() <= tailPairing->getFirstDuty()->getStartTimeUtcAct()) {
			if (checkOnlyTailPairingRangeInUtcAct(activity, halfPairing.tailPairing, tailPairingMonthFirstDayUtcAct)) {
				halfPairing.halfPairingMandayActivities.emplace_back(activity);//仅计算Pairing，不用按天计算（避免重复计算）

				if (activity->getStartTimeUtcAct() < tailPairingMonthFirstDayUtcAct) {//若跨“后半环所在月首日”，需要重新补回到crewMandayActivities
					SharedPtr<MandayActivity> missingActivity = std::make_shared<MandayActivity>(*activity);
					missingActivity->setRosterId(0);
					missingActivity->setEndTimeUtcAct(tailPairingMonthFirstDayUtcAct);
					missingActivity->setEndTimeUtcSch(tailPairingMonthFirstDayUtcAct);

					missingActivity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
					missingActivity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

					if (halfPairing.isLongPerDiemDutyForTailPairing) {
						missingActivity->setSubType(LONG_PERDIEM);
					}
					missingMandayActivities.emplace_back(missingActivity);
				}
			}
		}

		auto& tailPairing = halfPairing.tailPairing;
		crewMandayActivities.erase(std::remove_if(crewMandayActivities.begin(), crewMandayActivities.end(),
			[tailPairingMonthFirstDayUtcAct, tailPairing](const auto& activity) {return checkOnlyTailPairingRangeInUtcAct(activity, tailPairing, tailPairingMonthFirstDayUtcAct); })
			, crewMandayActivities.end());

		crewMandayActivities.insert(crewMandayActivities.end(), missingMandayActivities.begin(), missingMandayActivities.end());

		//整个场景时间段仅包含半环的后段，从商务机的“后半环所在月首日”到第一个排班Roster开始时间计入PH
		crewMandayActivities.emplace_back(GetPerDiemActivityBetweenMonthFirstDayAndTailPairing(halfPairing.tailPairing, halfPairing.isLongPerDiemDutyForTailPairing, offsetTZMinutes, dutyTimeTypeMap));
	}
	else if (halfPairing.headPairing != nullptr && halfPairing.tailPairing != nullptr) {//完整半环
		//半环场景3：整个场景时间段包含完整的半环前段和后段
		//无需处理
	}

	if (crewMandayActivities.empty()) {
		return std::tuple<map<time_t, MandayPerDiem>, map<long long, PerDiem>>();
	}

	//获得Manday结果
	map<time_t, MandayPerDiem> mandayResults = GetMandayResults(crewMandayActivities, this->GetDataContext(), offsetTZMinutes);
	//获得roster结果
	map<long long, PerDiem> rostersResults = GetRosterResults(crewMandayActivities, halfPairing.halfPairingMandayActivities, this->GetDataContext(), offsetTZMinutes);

	return std::make_tuple(mandayResults, rostersResults);
}

vector<SharedPtr<MandayActivity>> CalculatePerDiemHoursInMandayForEvaFdRule::CalculatePerDiem(const ROSTER* currRoster, const string& crewBase, const int offsetTZMinutes, HalfPairing& halfPairing, map<long long, string>& dutyTimeTypeMap) {
	vector<SharedPtr<MandayActivity>> crewMandayActivities;
	//当前Pairing是否存在Long Perdiem Duty
	bool isLongPerdiemInCurrPairing = ExistLongPerdiemDuty(currRoster->pairing, halfPairing.isLongPerDiemDutyForHeadPairing, this->GetDataContext());

	if (currRoster->pairing == nullptr) {
		return vector<SharedPtr<MandayActivity>>();
	}

	bool matched = false;
	vector<SharedPtr<MandayActivity>> pairingPerDiemActivity = GetPerDiemActivityForPairing(matched, halfPairing.halfPairingMandayActivities, dutyTimeTypeMap, currRoster->pairing, currRoster, halfPairing.headPairing, offsetTZMinutes);
	crewMandayActivities.insert(crewMandayActivities.end(), pairingPerDiemActivity.begin(), pairingPerDiemActivity.end());

	if (matched) {
		//设置半环前段和后段，循环迭代中使用
		CalculatePerDiemHoursInMandayForEvaFdRule::HalfPairingFlag halfPairingFlag = GetHalfPairingFlagOfBusinessAviation(currRoster->pairing, crewBase);
		if (halfPairingFlag == CalculatePerDiemHoursInMandayForEvaFdRule::HalfPairingFlag::HEAD) {
			halfPairing.headPairing = currRoster->pairing;
			halfPairing.isLongPerDiemDutyForHeadPairing = DutyUtils::IsLongPerdiem(halfPairing.headPairing->getLastDuty(), this->GetDataContext());
		}
		else if (halfPairingFlag == CalculatePerDiemHoursInMandayForEvaFdRule::HalfPairingFlag::TAIL) {
			halfPairing.tailPairing = currRoster->pairing;
			halfPairing.isLongPerDiemDutyForTailPairing = DutyUtils::IsLongPerdiem(halfPairing.tailPairing->getLastDuty(), this->GetDataContext());

			if (halfPairing.headPairing != nullptr) {//构成完整环
				//针对场景中同时存在headPairing和tailPairing时，tailPairing由于isBetweenHalfPairing=true，导致上面GetPerDiemActivityForPairing()方法无法计算PerDiem，这里需要补充计算
				bool matched2 = false;
				vector<SharedPtr<MandayActivity>> tmpPairingPerDiemActivity = GetPerDiemActivityForPairing(matched2, halfPairing.halfPairingMandayActivities, dutyTimeTypeMap, halfPairing.tailPairing, currRoster, nullptr, offsetTZMinutes);
				crewMandayActivities.insert(crewMandayActivities.end(), tmpPairingPerDiemActivity.begin(), tmpPairingPerDiemActivity.end());
			}
		}
			
		if (halfPairing.headPairing != nullptr && halfPairing.tailPairing != nullptr) {
			if (halfPairing.headPairing->getBase() != halfPairing.tailPairing->getEndArp()) {
				Logger::getRuleLogger()->error("Half Pairing nesting error. head paring id:{} dep station:{}, tail pairing id:{} arr station:{}", 
					halfPairing.headPairing->getDbId(), halfPairing.headPairing->getBase(), halfPairing.tailPairing->getDbId(), halfPairing.tailPairing->getEndArp());
			}
			//计算头尾半环之间的Perdiem时长，从“头半环的签出时间”到“尾半环的签到时间”
			auto tmpPerDiemActivityBetweenPairing = GetPerDiemActivityBetweenPairing(halfPairing.headPairing, halfPairing.tailPairing, offsetTZMinutes, dutyTimeTypeMap);
			if (halfPairing.isLongPerDiemDutyForHeadPairing && halfPairing.isLongPerDiemDutyForTailPairing) {
				tmpPerDiemActivityBetweenPairing->setSubType(LONG_PERDIEM);
			}
			crewMandayActivities.emplace_back(tmpPerDiemActivityBetweenPairing);

			halfPairing.headPairing = nullptr;
			halfPairing.tailPairing = nullptr;
		}
	}

	//若找到半环后端，最后则清空所有半环的LongPerDiem标记
	if (halfPairing.tailPairing != nullptr && (halfPairing.isLongPerDiemDutyForHeadPairing || halfPairing.isLongPerDiemDutyForTailPairing)) {
		halfPairing.isLongPerDiemDutyForHeadPairing = false;
		halfPairing.isLongPerDiemDutyForTailPairing = false;
	}
	return crewMandayActivities;
}

vector<SharedPtr<MandayActivity>> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityForPairing(bool& matched, vector<SharedPtr<MandayActivity>>& halfPairingMandayActivities, map<long long, string>& dutyTimeTypeMap, const Pairing* pairing, const ROSTER* roster, const Pairing* headPairing, const int offsetTZMinutes) {
	auto& dbData = this->GetDataContext();
	vector<SharedPtr<MandayActivity>> crewMandayActivities;
	vector<SharedPtr<MandayActivity>> specilSegmengsPerDiemActivities;
	SpecialPairingFlag specialPairingFlag = GetSpecialPairingFlag(roster, pairing);
	int perDiemInSec = 0;//单位：秒

	Duty* prevDuty = nullptr;//紧接前一个能匹配到Duty
	string prevDutyTimeType = "SCH";
	bool isPerDiemOfPrevDuty = false;; //紧接前一个能匹配到Duty是否计入Perdiem
	//rulePaam._perDiemGapMinutes针对整个Pairing的Gap，因此每个Pairing仅能计算一次
	map<long long, int> mapPerDiemGap;//记录法规规则对应PerDiemGap值<ruleParamId, perDiemGapMinutes>
	bool isLongPerDiemOfPrevDuty = false;//前一个Duty是否计入Long Perdiem
	bool isPairingCalcPerdiem = false;//Pairing是否存在计算的Duty。false：Pairing的Duty都不计算PH，true: Pairing存在某个Duty都不计算PH
	set<int> dutySeqsPerDiem; //Pairing中计算Perdiem的Duty的DutySeq
	SharedPtr<MandayActivity> firstDutyPerDiemActivity, lastDutyPerDiemActivity;//头和尾Duty的Perdiem，注意：头尾Duty可能是同一Duty
	for (const auto& currDuty : pairing->getDutyVec()) {
		bool matchedWithDuty = false;
		for (const auto& ruleParam : _ruleParams) {
			if (ruleParam.MatchParam(pairing, currDuty, roster)) {
				string timeType = GetTimeType(currDuty, offsetTZMinutes, ruleParam);
				dutyTimeTypeMap[currDuty->getDutyId()] = timeType;
				matched = true;
				matchedWithDuty = true;
				if (ruleParam.ExistSegmentSpecialTag(roster, currDuty)) {
					//当前Duty计入Per Diem
					prevDuty = nullptr;
					prevDutyTimeType = "SCH";
					isPerDiemOfPrevDuty = false;
					isLongPerDiemOfPrevDuty = false;
					break;
				}
				bool isPerDiemOfCurrDuty = false;//当前Duty是否计入Perdiem
				SharedPtr<MandayActivity> dutyPerDiemActivity = GetPerDiemActivityForDuty(mapPerDiemGap, currDuty, pairing, specialPairingFlag, offsetTZMinutes, timeType, ruleParam);
				if (ruleParam._perDiemExpressionMinutes != nullptr && *(ruleParam._perDiemExpressionMinutes) == 0) {
					//针对Duty的PerDiem为0
					auto tmpActivities = GetPerDiemActivityForSpecilSegments(currDuty, offsetTZMinutes, timeType);
					specilSegmengsPerDiemActivities.insert(specilSegmengsPerDiemActivities.end(), tmpActivities.begin(), tmpActivities.end());
				}
				if (pairing->getFirstDuty()->getDutyId() == currDuty->getDutyId()) {
					firstDutyPerDiemActivity = dutyPerDiemActivity;
				}
				if (pairing->getLastDuty()->getDutyId() == currDuty->getDutyId()) {
					lastDutyPerDiemActivity = dutyPerDiemActivity;
				}

				bool isLongPerDiemOfCurrDuty = false;//当前Duty是否计入Long Perdiem
				if (dutyPerDiemActivity != nullptr) {
					isPerDiemOfCurrDuty = true;
					//当前Duty是否计入Long Perdiem
					isLongPerDiemOfCurrDuty = DutyUtils::IsLongPerdiem(currDuty, dbData);
					if (isLongPerDiemOfCurrDuty) {
						dutyPerDiemActivity->setSubType(LONG_PERDIEM);
					}
					crewMandayActivities.emplace_back(dutyPerDiemActivity);
					if (ruleParam._perDiemExpressionMinutes == nullptr || *(ruleParam._perDiemExpressionMinutes) != 0) {
						isPairingCalcPerdiem = true;
						dutySeqsPerDiem.insert(currDuty->getDutySeq());
					}
				}
				
				//perDiemInSec += dutyPerDiemInSec;

				//紧接前一个Duty若匹配上，则计算prevDuty和currDuty之间的DropOff(prevDuty)、Layover、Pickup(currDuty)时间
				if (prevDuty != nullptr) {
					if (isPerDiemOfCurrDuty) {
						//prevDuty和currDuty之间的DropOff(prevDuty)、Layover、Pickup(currDuty)时间，计入Per Diem
						auto tmpDutyPerDiemActivity = GetPerDiemActivityBetweenDuties(prevDuty, currDuty, offsetTZMinutes, timeType, prevDutyTimeType);
						if (isLongPerDiemOfCurrDuty && isLongPerDiemOfPrevDuty) {
							//当前Duty和前一个Duty都满足 Long Perdiem，中间DropOff(prevDuty)、Layover、Pickup(currDuty)等才计入LPH
							tmpDutyPerDiemActivity->setSubType(LONG_PERDIEM);
						}
						crewMandayActivities.emplace_back(tmpDutyPerDiemActivity);
					}
					else {
						//prevDuty和currDuty之间的DropOff(prevDuty)、Layover、Pickup(currDuty)时间，不计入Per Diem
					}
				}
				prevDuty = currDuty;
				prevDutyTimeType = timeType;
				isPerDiemOfPrevDuty = isPerDiemOfCurrDuty;
				isLongPerDiemOfPrevDuty = isLongPerDiemOfCurrDuty;
				break;
			}
		}
		if (!matchedWithDuty) {
			//当前Duty未计入Per Diem
			prevDuty = nullptr;
			prevDutyTimeType = "SCH";
			isPerDiemOfPrevDuty = false;
			isLongPerDiemOfPrevDuty = false;
		}
	}

	if (isPairingCalcPerdiem) {
		if (specialPairingFlag == SpecialPairingFlag::OUTER_BASE) {
			auto outerBaseActivities = GetPerDiemActivityForOuterBase(firstDutyPerDiemActivity, lastDutyPerDiemActivity, dutySeqsPerDiem, pairing, offsetTZMinutes, "ACT");
			crewMandayActivities.insert(crewMandayActivities.end(), outerBaseActivities.begin(), outerBaseActivities.end());
		}
		crewMandayActivities.insert(crewMandayActivities.end(), specilSegmengsPerDiemActivities.begin(), specilSegmengsPerDiemActivities.end());
	}
	else {
		//整个Pairing都不计算PH，特殊计算的Segement若计算PH，则返回
		std::for_each(specilSegmengsPerDiemActivities.begin(), specilSegmengsPerDiemActivities.end(), [roster](SharedPtr<MandayActivity>& activity) {
			activity->setRosterId(roster->rosterId);
			});
		return specilSegmengsPerDiemActivities;
	}

	//将ruleParam._perDiemGapMinutes转换成时间段来表达。即：_perDiemGapMinutes = endTime - startTime。
	// 如何确定startTime，影响到_perDiemGapMinutes如何划分到哪天
	for (auto& pair : mapPerDiemGap) {
		//perDiemInSec += pair.second * 60;
		//Pairing Gap值，计入Per Diem
		//TODO Per Diem的时间段如何采用，挂着Pairing结束时间所在天
		SharedPtr<MandayActivity> gapPerDiemActivity = GetPerDiemActivityForPairingGap(pairing, pair.second, offsetTZMinutes, dutyTimeTypeMap);

		crewMandayActivities.emplace_back(gapPerDiemActivity);
	}

	if (headPairing != nullptr) {
		//在半环中，已经存在前半段
		time_t headPairingEndMonthUtcAct = GetHeadPairingEndMonthUtc(headPairing, offsetTZMinutes, "ACT");
		if (headPairingEndMonthUtcAct >= pairing->getFirstDuty()->getStartTimeUtcAct()) {
			halfPairingMandayActivities.insert(halfPairingMandayActivities.end(), crewMandayActivities.begin(), crewMandayActivities.end());
			crewMandayActivities.clear();
		}
	}

	std::for_each(crewMandayActivities.begin(), crewMandayActivities.end(), [roster](SharedPtr<MandayActivity>& activity) {
			activity->setRosterId(roster->rosterId);
		});
	
	return crewMandayActivities;
}

SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityForDuty(std::map<long long, int>& mapPerDiemGap, const Duty* duty, const Pairing* pairing, const SpecialPairingFlag specialPairingFlag, const int offsetTZMinutes, const string& timeType, const PerDiemHoursForEvaFdRuleParam& ruleParam) const {
	SharedPtr<MandayActivity> activity = nullptr;
	if (ruleParam._perDiemExpressionMinutes != nullptr) {
		activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
		//固定时长，计入到开始时间所在天。为了避免被跨天切分，结束时间=开始时间+1s
		//activity->setStartTimeUtcSch(duty->getStartTimeUtcSch());
		//activity->setEndTimeUtcSch(duty->getEndTimeUtcSch());
		//activity->setStartTimeUtcAct(duty->getStartTimeUtcAct());
		//activity->setEndTimeUtcAct(duty->getEndTimeUtcAct());
		activity->setStartTimeUtcSch(SchDutyUtils::GetDutySchStartTimeUtc(duty, true));
		activity->setEndTimeUtcSch(activity->getStartTimeUtcSch() + 1);
		activity->setStartTimeUtcAct(duty->getStartTimeUtcAct());
		activity->setEndTimeUtcAct(activity->getStartTimeUtcAct() + 1);

		activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
		activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

		int duration = (*ruleParam._perDiemExpressionMinutes) * 60;
		activity->setCalcDuration(duration, "ACT");
		activity->setCalcDuration(duration, "SCH");
	}
	else if (ruleParam._perDiemExpression == "D-B") {
		activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
		//整个Duty时长计入Per Diem
		//dutyPerDiemInSec = duty->getEndTimeUtcAct() - duty->getStartTimeUtcAct();
		activity->setStartTimeUtcSch(SchDutyUtils::GetDutySchStartTimeUtc(duty, true));
		activity->setEndTimeUtcSch(SchDutyUtils::GetDutySchEndTimeUtc(duty, true) + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, "SCH"));
		activity->setStartTimeUtcAct( (timeType == "ACT") ? duty->getStartTimeUtcAct() : SchDutyUtils::GetDutySchStartTimeUtc(duty, true));
		activity->setEndTimeUtcAct( ((timeType == "ACT") ? duty->getEndTimeUtcAct() : SchDutyUtils::GetDutySchEndTimeUtc(duty, true)) + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, timeType));

		activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
		activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	}
	//else if (ruleParam._perDiemExpression == "0") {
	//	//整个Duty时长不计入Per Diem
	//	//dutyPerDiemInSec = 0
	//	activity = nullptr;
	//}
	if (ruleParam._perDiemGapMinutes != 0
		&& (mapPerDiemGap.find(ruleParam.GetRuleParamId()) == mapPerDiemGap.end())) {
		mapPerDiemGap.insert(std::make_pair(ruleParam.GetRuleParamId(), ruleParam._perDiemGapMinutes));
	}
	return activity;
}

vector<SharedPtr<MandayActivity>> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityForOuterBase(const SharedPtr<MandayActivity>& firstDutyPerDiemActivity, const SharedPtr<MandayActivity>& lastDutyPerDiemActivity, const set<int>& dutySeqsPerDiem, const Pairing* pairing, const int offsetTZMinutes, const string& timeType) const {
		vector<SharedPtr<MandayActivity>> activities;
	
		if (firstDutyPerDiemActivity == nullptr || firstDutyPerDiemActivity->getCalcDuration("SCH") == 0) {
			auto& dutySegments = pairing->getFirstDuty()->getSegmentsRead();
			size_t segmentCount = dutySegments.size();

			//去程高铁的PH = 第一个航班时间 + 航班间连接时间(可能不存在)
			SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
			activity->setStartTimeUtcSch(dutySegments[0]->getStartTimeUtcSch());
			activity->setStartTimeUtcAct((timeType == "ACT") ? dutySegments[0]->getStartTimeUtcAct() : dutySegments[0]->getStartTimeUtcSch());
			if (segmentCount > 1) {
				shared_ptr<PairingDutyNode> segBrief = Utility::GetInstancePtr()->getPairingDutyNodeOfSeg(pairing->getFirstDuty()->pairingDutyNodes, "BRIEF", dutySegments[0]->getDBId(), dutySegments[1]->getDBId());
				if (segBrief == nullptr) {
					activity->setEndTimeUtcSch(dutySegments[1]->getStartTimeUtcSch());
					activity->setEndTimeUtcAct((timeType == "ACT") ? dutySegments[1]->getStartTimeUtcAct() : dutySegments[1]->getStartTimeUtcSch());
				}
				else {
					activity->setEndTimeUtcSch(segBrief->getStartUtc());
					activity->setEndTimeUtcAct(segBrief->getStartUtc());
				}
			}
			else {
				//前期计算已经加入Layover，这里不用在加入
				//int nextDutySeq = pairing->getFirstDuty()->getDutySeq() + 1;
				//if (dutySeqsPerDiem.find(nextDutySeq) != dutySeqsPerDiem.end()) {
				//	//高铁独立Duty，并且下一个Duty计算PH，则Layover也需要计算PH
				//	auto nextDuty = (nextDutySeq > 1 && nextDutySeq <= pairing->getNumDuties()) ? pairing->getDuty(nextDutySeq - 1) : nullptr;
				//	if (nextDuty != nullptr) {
				//		activity->setEndTimeUtcSch(SchDutyUtils::GetDutySchStartTimeUtc(nextDuty, true));
				//		activity->setEndTimeUtcAct((timeType == "ACT") ? nextDuty->getStartTimeUtcAct() : SchDutyUtils::GetDutySchStartTimeUtc(nextDuty, true));
				//	}
				//}
				//else {
				//	activity->setEndTimeUtcSch(dutySegments[0]->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(dutySegments[0], offsetTZMinutes, timeType));
				//	activity->setEndTimeUtcAct(((timeType == "ACT") ? dutySegments[0]->getEndTimeUtcAct() : dutySegments[0]->getEndTimeUtcSch()) + RosterUtils::GetEndTimeGapInSec(dutySegments[0], offsetTZMinutes, timeType));
				//}
				//
				activity->setEndTimeUtcSch(dutySegments[0]->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(dutySegments[0], offsetTZMinutes, timeType));
				activity->setEndTimeUtcAct(((timeType == "ACT") ? dutySegments[0]->getEndTimeUtcAct() : dutySegments[0]->getEndTimeUtcSch()) + RosterUtils::GetEndTimeGapInSec(dutySegments[0], offsetTZMinutes, timeType));
			}


			activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
			activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
			activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
			activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

			activities.emplace_back(activity);
		}

		if (lastDutyPerDiemActivity == nullptr || lastDutyPerDiemActivity->getCalcDuration("SCH") == 0) {
			auto& dutySegments = pairing->getLastDuty()->getSegmentsRead();
			size_t segmentCount = dutySegments.size();
			//回程高铁的PH = 航班间连接时间(可能不存在) + 最后一个航班时间
			SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
			if (segmentCount > 1) {
				shared_ptr<PairingDutyNode> segDebrief = Utility::GetInstancePtr()->getPairingDutyNodeOfSeg(pairing->getLastDuty()->pairingDutyNodes, "DEBRIEF", dutySegments[segmentCount - 2]->getDBId(), dutySegments[segmentCount - 1]->getDBId());
				if (segDebrief == nullptr) {
					activity->setStartTimeUtcSch(dutySegments[segmentCount - 2]->getEndTimeUtcSch());
					activity->setStartTimeUtcAct((timeType == "ACT") ? dutySegments[segmentCount - 2]->getEndTimeUtcAct() : dutySegments[segmentCount - 2]->getEndTimeUtcSch());
				}
				else {
					activity->setStartTimeUtcSch(segDebrief->getEndUtc());
					activity->setStartTimeUtcAct(segDebrief->getEndUtc());
				}
			}
			else {
				//前期计算已经加入Layover，这里不用在加入
				//int prevDutySeq = pairing->getLastDuty()->getDutySeq() - 1;
				//if (dutySeqsPerDiem.find(prevDutySeq) != dutySeqsPerDiem.end()) {
				//	//高铁独立Duty，并且下一个Duty计算PH，则Layover也需要计算PH
				//	auto prevDuty = (prevDutySeq >=1 && prevDutySeq <= pairing->getNumDuties()) ? pairing->getDuty(prevDutySeq - 1) : nullptr;
				//	if (prevDuty != nullptr) {
				//		activity->setStartTimeUtcSch(SchDutyUtils::GetDutySchEndTimeUtc(prevDuty, true) + RosterUtils::GetEndTimeGapInSec(prevDuty->getLastSegment(), offsetTZMinutes, timeType));
				//		activity->setStartTimeUtcAct(((timeType == "ACT") ? prevDuty->getEndTimeUtcAct() : SchDutyUtils::GetDutySchEndTimeUtc(prevDuty, true)) + RosterUtils::GetEndTimeGapInSec(prevDuty->getLastSegment(), offsetTZMinutes, timeType));
				//	}
				//}
				//else {
				//	activity->setStartTimeUtcSch(dutySegments[segmentCount - 1]->getStartTimeUtcSch());
				//	activity->setStartTimeUtcAct((timeType == "ACT") ? dutySegments[segmentCount - 1]->getStartTimeUtcAct() : dutySegments[segmentCount - 1]->getStartTimeUtcSch());
				//}
				activity->setStartTimeUtcSch(dutySegments[segmentCount - 1]->getStartTimeUtcSch());
				activity->setStartTimeUtcAct((timeType == "ACT") ? dutySegments[segmentCount - 1]->getStartTimeUtcAct() : dutySegments[segmentCount - 1]->getStartTimeUtcSch());

			}

			activity->setEndTimeUtcSch(dutySegments[segmentCount - 1]->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(dutySegments[segmentCount - 1], offsetTZMinutes, timeType));
			activity->setEndTimeUtcAct(((timeType == "ACT") ? dutySegments[segmentCount - 1]->getEndTimeUtcAct() : dutySegments[segmentCount - 1]->getEndTimeUtcSch()) + RosterUtils::GetEndTimeGapInSec(dutySegments[segmentCount - 1], offsetTZMinutes, timeType));

			activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
			activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
			activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
			activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

			activities.emplace_back(activity);
		}
		return activities;
}

//针对特殊场景：Duty不计算PH，但其中某些特定Segment需要计算PH
vector<SharedPtr<MandayActivity>> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityForSpecilSegments(const Duty* duty, const int offsetTZMinutes, const string& timeType) const {
	vector<SharedPtr<MandayActivity>> activities;
	static set<string> groupAssignments = { "JES", "MON", "ORT"};
	for (auto& segment : duty->getSegmentsRead()) {
		if (groupAssignments.find(segment->getAssignment()) != groupAssignments.end()) {
			SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
			//整个Segment时长计入Per Diem
			activity->setStartTimeUtcSch(segment->getStartTimeUtcSch());
			activity->setEndTimeUtcSch(segment->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(segment, offsetTZMinutes, "SCH"));
			activity->setStartTimeUtcAct((timeType == "ACT") ? segment->getStartTimeUtcAct() : segment->getStartTimeUtcSch());
			activity->setEndTimeUtcAct(((timeType == "ACT") ? segment->getEndTimeUtcAct() : segment->getEndTimeUtcSch()) + RosterUtils::GetEndTimeGapInSec(segment, offsetTZMinutes, timeType));

			activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
			activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
			activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
			activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
			activities.emplace_back(activity);
		}
	}
	return activities;
}


//vector<SharedPtr<MandayActivity>> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityForSpecialPairingDuty(std::map<long long, int>& mapPerDiemGap, SharedPtr<MandayActivity>& dutyPerDiemActivity, const Pairing* pairing, const Duty* currDuty, const int offsetTZMinutes, const SpecialPairingFlag specialPairingFlag, const string& timeType) const {
//	vector<SharedPtr<MandayActivity>> activities;
//
//	auto firstDuty = pairing->getFirstDuty();
//	auto lastDuty = pairing->getLastDuty();
//
//	if (currDuty->getDutyId() == firstDuty->getDutyId() || currDuty->getDutyId() == lastDuty->getDutyId()) { //第一个Duty或最后一个Duty，出发高铁PH增加額外2小時
//		dutyPerDiemActivity = nullptr;//通过正常场景计算Duty的perdiem，这里清空，重新计算采用Segment维度
//
//		//针对Duty，首先计算Segment以及Segment之间PH
//		Segment* prevSegment = nullptr;
//		for (auto& currSegment : currDuty->getSegmentsRead()) {
//			vector<SharedPtr<MandayActivity>> tmpActivities = GetPerDiemActivityForSpecialPairingDutySegment(pairing, currSegment, offsetTZMinutes, specialPairingFlag, timeType);
//
//			SharedPtr<MandayActivity> tmpActivitiy = GetPerDiemActivityForLayoverBetweenSegments(prevSegment, currSegment, offsetTZMinutes, timeType);
//			if (tmpActivitiy != nullptr) {
//				tmpActivities.emplace_back(tmpActivitiy);
//			}
//			activities.insert(activities.begin(), tmpActivities.begin(), tmpActivities.end());
//
//			prevSegment = currSegment;
//		}
//		//针对Duty，计算Duty的签到时间和签出时间
//		auto tmpActivity = GetPerDiemActivityForBriefInDuty(currDuty, offsetTZMinutes, timeType);
//		activities.emplace_back(tmpActivity);
//
//		tmpActivity = GetPerDiemActivityForDebriefInDuty(currDuty, offsetTZMinutes, timeType);
//		activities.emplace_back(tmpActivity);
//	}
//	else { //中间Duty
//		if (currDuty->getAssignment() != "FLY" && currDuty->getAssignment() != "MVO") {
//			//特殊Pairing外站时，若是中间的Duty，针对非飞行的不计算PH
//			dutyPerDiemActivity = nullptr;
//		}
//	}
//
//	return activities;
//}
//
//vector<SharedPtr<MandayActivity>> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityForSpecialPairingDutySegment(const Pairing* pairing, const Segment* segment, const int offsetTZMinutes, const SpecialPairingFlag specialPairingFlag, const string& timeType) const {
//	vector<SharedPtr<MandayActivity>> activities;
//	if (segment->getAssignment() != "FLY" && segment->getAssignment() != "DHD" && segment->getAssignment() != "TRAIN") {
//		return vector<SharedPtr<MandayActivity>>();
//	}
//
//	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
//	//整个Duty时长计入Per Diem
//	//dutyPerDiemInSec = duty->getEndTimeUtcAct() - duty->getStartTimeUtcAct();
//	activity->setStartTimeUtcSch(segment->getStartTimeUtcSch());
//	activity->setEndTimeUtcSch(segment->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(segment, offsetTZMinutes, "SCH"));
//	activity->setStartTimeUtcAct((timeType == "ACT") ? segment->getStartTimeUtcAct() : segment->getStartTimeUtcSch());
//	activity->setEndTimeUtcAct(((timeType == "ACT") ? segment->getEndTimeUtcAct() : segment->getEndTimeUtcSch()) + RosterUtils::GetEndTimeGapInSec(segment, offsetTZMinutes, timeType));
//
//	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
//	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
//	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
//	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
//	activities.emplace_back(activity);
//
//	if (specialPairingFlag == SpecialPairingFlag::OUTER_BASE_FIRST_FLY) {
//		if (pairing->getFirstSegment()->getSegmentId() == segment->getSegmentId()) { //出发高铁
//			SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
//			//固定时长，计入到开始时间所在天。为了避免被跨天切分，结束时间=开始时间+1s
//			activity->setStartTimeUtcSch(segment->getStartTimeUtcSch());
//			activity->setEndTimeUtcSch(activity->getStartTimeUtcSch() + 1);
//			activity->setStartTimeUtcAct(segment->getStartTimeUtcAct());
//			activity->setEndTimeUtcAct(activity->getStartTimeUtcAct() + 1);
//
//			activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
//			activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
//			activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
//			activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
//
//			int duration = 120 * 60;//出发高铁PH增加額外2小時(120分钟)
//			activity->setCalcDuration(duration, "ACT");
//			activity->setCalcDuration(duration, "SCH");
//			activities.emplace_back(activity);
//		}
//		else if (pairing->getLastSegment()->getSegmentId() == segment->getSegmentId()) { //回程高铁
//			SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
//			//固定时长，计入到开始时间所在天。为了避免被跨天切分，结束时间=开始时间+1s
//			activity->setStartTimeUtcSch(segment->getStartTimeUtcSch());
//			activity->setEndTimeUtcSch(activity->getStartTimeUtcSch() + 1);
//			activity->setStartTimeUtcAct((timeType == "ACT") ? segment->getStartTimeUtcAct() : segment->getStartTimeUtcSch());
//			activity->setEndTimeUtcAct(activity->getStartTimeUtcAct() + 1);
//
//			activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
//			activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
//			activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
//			activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
//
//			int duration = 90 * 60;//回程高铁PH增加額外1.5小時(90分钟)
//			activity->setCalcDuration(duration, "ACT");
//			activity->setCalcDuration(duration, "SCH");
//			activities.emplace_back(activity);
//		}
//	}
//	else if (specialPairingFlag == SpecialPairingFlag::OUTER_BASE_FIRST_NOT_FLY) {
//		//无需特殊处理
//	}
//	return activities;
//}

SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityBetweenDuties(const Duty* prevDuty, const Duty* currDuty, const int offsetTZMinutes, const string& timeType, const string& prevDutyTimeType) const {
	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);

	//prevDuty和currDuty之间的DropOff(prevDuty)、Layover、Pickup(currDuty)时间，计入Per Diem
	//perDiemInSec = (currDuty->getStartTimeUtcAct() - prevDuty->getEndTimeUtcAct());
	activity->setStartTimeUtcSch(SchDutyUtils::GetDutySchEndTimeUtc(prevDuty, true) + RosterUtils::GetEndTimeGapInSec(prevDuty->getLastSegment(), offsetTZMinutes, "SCH"));
	activity->setEndTimeUtcSch(SchDutyUtils::GetDutySchStartTimeUtc(currDuty, true));
	activity->setStartTimeUtcAct( ((prevDutyTimeType == "ACT") ? prevDuty->getEndTimeUtcAct() : SchDutyUtils::GetDutySchEndTimeUtc(prevDuty, true)) + RosterUtils::GetEndTimeGapInSec(prevDuty->getLastSegment(), offsetTZMinutes, prevDutyTimeType));
	activity->setEndTimeUtcAct( (timeType == "ACT") ? currDuty->getStartTimeUtcAct() : SchDutyUtils::GetDutySchStartTimeUtc(currDuty, true));

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	return activity;
}

SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityForPickupInDuty(const Duty* duty, const int offsetTZMinutes, const string& timeType) const {
	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
	//Duty的Pickup时间段，计入Per Diem
	activity->setStartTimeUtcSch(SchDutyUtils::GetDutySchStartTimeUtc(duty, true) - (time_t)duty->getMinPickup() * 60);
	activity->setEndTimeUtcSch(SchDutyUtils::GetDutySchStartTimeUtc(duty, true));
	if (timeType == "ACT") {
		activity->setStartTimeUtcAct(duty->getStartTimeUtcAct() - (time_t)duty->getActualPickupMin() * 60);
		activity->setEndTimeUtcAct(duty->getStartTimeUtcAct());
	}
	else {
		activity->setStartTimeUtcAct(SchDutyUtils::GetDutySchStartTimeUtc(duty, true) - (time_t)duty->getMinPickup() * 60);
		activity->setEndTimeUtcAct(SchDutyUtils::GetDutySchStartTimeUtc(duty, true));
	}

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

	return activity;
}


SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityForBriefInDuty(const Duty* duty, const int offsetTZMinutes, const string& timeType) const {
	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
	//Duty的Brief时间段，计入Per Diem
	activity->setStartTimeUtcSch(SchDutyUtils::GetDutySchStartTimeUtc(duty, true));
	activity->setEndTimeUtcSch(duty->getFirstSegment()->getStartTimeUtcSch());
	activity->setStartTimeUtcAct((timeType == "ACT") ?  duty->getStartTimeUtcAct() : SchDutyUtils::GetDutySchStartTimeUtc(duty, true));
	activity->setEndTimeUtcAct((timeType == "ACT") ? duty->getFirstSegment()->getStartTimeUtcAct() : duty->getFirstSegment()->getStartTimeUtcSch());

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

	return activity;
}

SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityForDebriefInDuty(const Duty* duty, const int offsetTZMinutes, const string& timeType) const {
	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
	//Duty的debrief时间段，计入Per Diem
	activity->setStartTimeUtcSch(duty->getLastSegment()->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, "SCH"));
	activity->setEndTimeUtcSch(SchDutyUtils::GetDutySchEndTimeUtc(duty, true) + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, "SCH"));
	if (timeType == "ACT") {
		activity->setStartTimeUtcAct(duty->getLastSegment()->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, "ACT"));
		activity->setEndTimeUtcAct(duty->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, "ACT"));
	}
	else {
		activity->setStartTimeUtcAct(duty->getLastSegment()->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, timeType));
		activity->setEndTimeUtcAct(SchDutyUtils::GetDutySchEndTimeUtc(duty, true) + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, timeType));
	}

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

	return activity;
}

SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityForDropOffInDuty(const Duty* duty, const int offsetTZMinutes, const string& timeType) const {
	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
	//Duty的Dropoff时间段，计入Per Diem
	activity->setStartTimeUtcSch(SchDutyUtils::GetDutySchEndTimeUtc(duty, true) + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, "SCH"));
	activity->setEndTimeUtcSch(SchDutyUtils::GetDutySchEndTimeUtc(duty, true) + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, "SCH") + (time_t)duty->getMinDropoff() * 60);
	if (timeType == "ACT") {
		activity->setStartTimeUtcAct(duty->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, "ACT"));
		activity->setEndTimeUtcAct(duty->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, "ACT") + (time_t)duty->getActualDropoffMin() * 60);
	}
	else {
		activity->setStartTimeUtcAct(SchDutyUtils::GetDutySchEndTimeUtc(duty, true) + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, timeType));
		activity->setEndTimeUtcAct(SchDutyUtils::GetDutySchEndTimeUtc(duty, true) + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, timeType) + (time_t)duty->getMinDropoff() * 60);
	}

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

	return activity;
}

SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityForLayoverBetweenDuties(const Duty* prevDuty, const Duty* currDuty, const int offsetTZMinutes, const string& timeType, const string& prevDutyTimeType) const {
	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);

	//二个Duty之间Layover时间段计入Per Diem（注意不包括 prevDuty.DropOff, currDuty.Pickup)
	activity->setStartTimeUtcSch(SchDutyUtils::GetDutySchEndTimeUtc(prevDuty, true) + RosterUtils::GetEndTimeGapInSec(prevDuty->getLastSegment(), offsetTZMinutes, "SCH") + (time_t)prevDuty->getMinDropoff() * 60);
	activity->setEndTimeUtcSch(SchDutyUtils::GetDutySchStartTimeUtc(currDuty, true) - (time_t)currDuty->getMinPickup() * 60);
	if (prevDutyTimeType == "ACT") {
		activity->setStartTimeUtcAct(prevDuty->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(prevDuty->getLastSegment(), offsetTZMinutes, "ACT") + (time_t)prevDuty->getActualDropoffMin() * 60);
	}
	else {
		activity->setStartTimeUtcAct(SchDutyUtils::GetDutySchEndTimeUtc(prevDuty, true) + RosterUtils::GetEndTimeGapInSec(prevDuty->getLastSegment(), offsetTZMinutes, timeType) + (time_t)prevDuty->getMinDropoff() * 60);
	}

	if (timeType == "ACT") {
		activity->setEndTimeUtcAct(currDuty->getStartTimeUtcAct() - (time_t)currDuty->getActualPickupMin() * 60);
	}
	else {
		activity->setEndTimeUtcAct(SchDutyUtils::GetDutySchStartTimeUtc(currDuty, true) - (time_t)currDuty->getMinPickup() * 60);
	}

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	return activity;
}

SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityForLayoverBetweenSegments(const Segment* prevSegment, const Segment* currSegment, const int offsetTZMinutes, const string& timeType) const {
	if (prevSegment == nullptr) {
		return nullptr;
	}

	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);

	//二个Segment之间中转时间段计入Per Diem
	activity->setStartTimeUtcSch(prevSegment->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(prevSegment, offsetTZMinutes, "SCH"));
	activity->setEndTimeUtcSch(currSegment->getStartTimeUtcSch());
	activity->setStartTimeUtcAct(((timeType == "ACT") ? prevSegment->getEndTimeUtcAct() : prevSegment->getEndTimeUtcSch()) + RosterUtils::GetEndTimeGapInSec(prevSegment, offsetTZMinutes, timeType));
	activity->setEndTimeUtcAct((timeType == "ACT") ? currSegment->getStartTimeUtcAct() : currSegment->getStartTimeUtcSch());

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	return activity;
}

SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityForPairingGap(const Pairing* pairing, const int perDiemGapMinutes, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap) {
	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
	//法规参数中Pairing的Gap，计入Per Diem。时间段放入Pairing结束时间所在的天？？？//TODO 这里存在疑问
	time_t startTimeUtcSch = pairing->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(pairing->getLastDuty()->getLastSegment(), offsetTZMinutes, "SCH");
	time_t startTimeUtcAct = startTimeUtcSch;

	string timeType = GetTimeType(pairing->getLastDuty(), dutyTimeTypeMap);
	if (timeType == "ACT") {
		startTimeUtcAct = pairing->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(pairing->getLastDuty()->getLastSegment(), offsetTZMinutes, "ACT");
	}

	activity->setStartTimeUtcSch(startTimeUtcSch);
	activity->setEndTimeUtcSch(startTimeUtcSch + (time_t)perDiemGapMinutes * 60);
	activity->setStartTimeUtcAct(startTimeUtcAct);
	activity->setEndTimeUtcAct(startTimeUtcAct + (time_t)perDiemGapMinutes * 60);

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	return activity;
}


//二个Roster之间“空白天/休息/Layover/Pairing第一个Duty的Pickup/Pairing最后一个Duty的Dropoff等（无任务）”计入Per-Diem时间段
SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityBetweenRoster(const ROSTER* currRoster, const ROSTER* prevRoster, const Pairing* headPairing, const Pairing* tailPairing, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap) {
	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
	//activity->setRosterId(currRoster->rosterId);
	if (prevRoster->pairing == nullptr) {
		activity->setStartTimeUtcSch(prevRoster->getRestStartUtcSch() + RosterUtils::GetEndTimeGapInSec(prevRoster, offsetTZMinutes, "SCH"));
		activity->setStartTimeUtcAct(prevRoster->getRestStartUtcAct() + RosterUtils::GetEndTimeGapInSec(prevRoster, offsetTZMinutes, "ACT"));
	}
	else {
		time_t startTimeUtcSch = SchDutyUtils::GetDutySchEndTimeUtc(prevRoster->pairing->getLastDuty(), true) + RosterUtils::GetEndTimeGapInSec(prevRoster->pairing->getLastDuty()->getLastSegment(), offsetTZMinutes, "SCH");
		time_t startTimeUtcAct = startTimeUtcSch;

		string prevTimeType = GetTimeType(prevRoster->pairing->getLastDuty(), dutyTimeTypeMap);
		if (prevTimeType == "ACT") {
			startTimeUtcAct = prevRoster->pairing->getLastDuty()->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(prevRoster->pairing->getLastDuty()->getLastSegment(), offsetTZMinutes, "ACT");
		}

		if (headPairing != nullptr && prevRoster->pairing->getDbId() == headPairing->getDbId()) {
			//prevRoster.pairing是半环头部，获得 半环结束时间 所在天的结束时间
			time_t headPairingEndDayUtcSch = TimeUtils::AddDay(SchDutyUtils::GetDutySchEndTimeUtc(headPairing->getLastDuty(), true), 1);
			time_t headPairingEndDayUtcAct = headPairingEndDayUtcSch;
			
			string headPairingTimeType = GetTimeType(headPairing->getLastDuty(), dutyTimeTypeMap);
			if (headPairingTimeType == "ACT") {
				headPairingEndDayUtcAct = TimeUtils::AddDay(headPairing->getLastDuty()->getEndTimeUtcAct(), 1);
			}

			headPairingEndDayUtcSch = TimeUtils::Truncate(headPairingEndDayUtcSch, offsetTZMinutes, ChronoUnit::DAYS);
			

			headPairingEndDayUtcAct = TimeUtils::Truncate(headPairingEndDayUtcAct, offsetTZMinutes, ChronoUnit::DAYS);

			if (currRoster->getStartTimeUtcSch() >= headPairingEndDayUtcSch) {
				//若prevRoster.pairing是半环头部（规则：半环第一天从Duty的 "Brief to Debrief"），并且 currRoster 与 prevRoster不在同一天，开始时间需要从第二天0点开始计算PH
				startTimeUtcSch = headPairingEndDayUtcSch;
				startTimeUtcAct = headPairingEndDayUtcAct;
			}
		}

		activity->setStartTimeUtcSch(startTimeUtcSch);
		activity->setStartTimeUtcAct(startTimeUtcAct);
	}

	if (currRoster->pairing == nullptr) {
		activity->setEndTimeUtcSch(currRoster->getStartTimeUtcSch());
		activity->setEndTimeUtcAct(currRoster->getStartTimeUtcAct());
	}
	else {
		time_t endTimeUtcSch = SchDutyUtils::GetDutySchStartTimeUtc(currRoster->pairing->getFirstDuty(), true);
		time_t endTimeUtcAct = endTimeUtcSch;
		string currTimeType = GetTimeType(currRoster->pairing->getFirstDuty(), dutyTimeTypeMap);
		if (currTimeType == "ACT") {
			 endTimeUtcAct = currRoster->pairing->getFirstDuty()->getStartTimeUtcAct();
		}

		if (tailPairing != nullptr && currRoster->pairing->getDbId() == tailPairing->getDbId()) {
			//currRoster.pairing是半环尾部，获得 半环开始时间 所在天的开始时间
			time_t tailPairingStartDayUtcSch = TimeUtils::Truncate(SchDutyUtils::GetDutySchStartTimeUtc(tailPairing->getFirstDuty(), true), offsetTZMinutes, ChronoUnit::DAYS);
			time_t tailPairingStartDayUtcAct = tailPairingStartDayUtcSch;

			string tailPairingTimeType = GetTimeType(tailPairing->getFirstDuty(), dutyTimeTypeMap);
			if (tailPairingTimeType == "ACT") {
				tailPairingStartDayUtcAct = TimeUtils::Truncate(tailPairing->getFirstDuty()->getStartTimeUtcAct(), offsetTZMinutes, ChronoUnit::DAYS);
			}

			if (prevRoster->getEndTimeUtcSch() <= tailPairingStartDayUtcSch) {
				//若currRoster.pairing是半环尾部（规则：半环最后一天从Duty的 "Brief to Debrief"），并且 currRoster 与 prevRoster不在同一天，PH结束时间为 半环尾部所在天的0点
				endTimeUtcSch = tailPairingStartDayUtcSch;
				endTimeUtcAct = tailPairingStartDayUtcAct;
			}
		}
		activity->setEndTimeUtcSch(endTimeUtcSch);
		activity->setEndTimeUtcAct(endTimeUtcAct);
	}
	

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

	return activity;
}

//二个Pairing之间“空白天/休息/Layover/第一个Pairing(headPairing)的最后一个Duty的Dropoff/第二个Pairing(tailPairing)第一个Duty的Pickup等（无任务）”计入Per-Diem时间段
SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityBetweenPairing(const Pairing* headPairing, const Pairing* tailPairing, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap) {
	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);
	//activity->setRosterId(currRoster->rosterId);

	time_t startTimeUtcSch = SchDutyUtils::GetDutySchEndTimeUtc(headPairing->getLastDuty(), true) + RosterUtils::GetEndTimeGapInSec(headPairing->getLastDuty()->getLastSegment(), offsetTZMinutes, "SCH");
	time_t startTimeUtcAct = startTimeUtcSch;
	string headPairingTimeType = GetTimeType(headPairing->getLastDuty(), dutyTimeTypeMap);
	if (headPairingTimeType == "ACT") {
		startTimeUtcAct = headPairing->getLastDuty()->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(headPairing->getLastDuty()->getLastSegment(), offsetTZMinutes, "ACT");
	}

	activity->setStartTimeUtcSch(startTimeUtcSch);
	activity->setStartTimeUtcAct(startTimeUtcAct);

	time_t endTimeUtcSch = SchDutyUtils::GetDutySchStartTimeUtc(tailPairing->getFirstDuty(), true);
	time_t endTimeUtcAct = endTimeUtcSch;
	string tailPairingTimeType = GetTimeType(tailPairing->getFirstDuty(), dutyTimeTypeMap);
	if (tailPairingTimeType == "ACT") {
		endTimeUtcAct = tailPairing->getFirstDuty()->getStartTimeUtcAct();
	}

	activity->setEndTimeUtcSch(endTimeUtcSch);
	activity->setEndTimeUtcAct(endTimeUtcAct);

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

	return activity;
}

//场景开始时间到场景第一个Roster之间，计入Per-Diem时间段
SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityBetweenScenarioStartAndFirstRoster(const Pairing* tailPairing, const ROSTER* firstRoster, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap) {
	const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();

	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);

	activity->setStartTimeUtcSch(dbData->scenario.startDtUTC);
	activity->setStartTimeUtcAct(dbData->scenario.startDtUTC);
	if (firstRoster->pairing == nullptr) {
		activity->setEndTimeUtcSch(firstRoster->getStartTimeUtcSch());
		activity->setEndTimeUtcAct(firstRoster->getStartTimeUtcAct());
	}
	else {
		if (firstRoster->pairing->getDbId() == tailPairing->getDbId()) {
			time_t endTimeUtcSch = TimeUtils::Truncate(SchDutyUtils::GetDutySchStartTimeUtc(firstRoster->pairing->getFirstDuty(), true), offsetTZMinutes, ChronoUnit::DAYS);
			time_t endTimeUtcAct = endTimeUtcSch;
			string timeType = GetTimeType(firstRoster->pairing->getFirstDuty(), dutyTimeTypeMap);
			if (timeType == "ACT") {
				endTimeUtcAct = TimeUtils::Truncate(firstRoster->pairing->getFirstDuty()->getStartTimeUtcAct(), offsetTZMinutes, ChronoUnit::DAYS);
			}

			activity->setEndTimeUtcSch(endTimeUtcSch);
			activity->setEndTimeUtcAct(endTimeUtcAct);
		}
		else {
			activity->setEndTimeUtcSch(SchDutyUtils::GetDutySchStartTimeUtc(firstRoster->pairing->getFirstDuty(), true));
			activity->setEndTimeUtcAct(activity->getEndTimeUtcSch());
			string timeType = GetTimeType(firstRoster->pairing->getFirstDuty(), dutyTimeTypeMap);
			if (timeType == "ACT") {
				activity->setEndTimeUtcAct(firstRoster->pairing->getFirstDuty()->getStartTimeUtcAct());
			}
		}
	}

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	return activity;
}

//针对场景仅有商务机后半环，从商务机的后半环所在月首日到后半环之间，计入Per-Diem时间段
SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityBetweenMonthFirstDayAndTailPairing(const Pairing* tailPairing, const bool isLongPerDiemDutyForTailPairing, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap) const {
	const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();

	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);

	//通过tailPairing计划时间来计算，获得后半环所在月首时间
	string timeType = GetTimeType(tailPairing->getFirstDuty(), dutyTimeTypeMap);
	time_t tailPairingMonthFirstDayUtcAct = GetTailPairingMonthFirstDayUtc(tailPairing, offsetTZMinutes, timeType);
	time_t tailPairingMonthFirstDayUtcSch = GetTailPairingMonthFirstDayUtc(tailPairing, offsetTZMinutes, "SCH");

	activity->setStartTimeUtcSch(tailPairingMonthFirstDayUtcSch);
	activity->setStartTimeUtcAct(tailPairingMonthFirstDayUtcAct);


	activity->setEndTimeUtcSch(SchDutyUtils::GetDutySchStartTimeUtc(tailPairing->getFirstDuty(), true));
	activity->setEndTimeUtcAct(tailPairing->getFirstDuty()->getStartTimeUtcAct());

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

	if (isLongPerDiemDutyForTailPairing) {
		activity->setSubType(LONG_PERDIEM);
	}
	return activity;
}

//场景"最后Roster结束时间" 到 "前半环结束时间月末"之间，计入Per-Diem时间段
SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityBetweenLastRosterAndScenarioEnd(const Pairing* headPairing, const ROSTER* lastRoster, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap) {

	const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();

	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);

	if (lastRoster->pairing == nullptr) {
		activity->setStartTimeUtcSch(lastRoster->getRestStartUtcSch() + RosterUtils::GetEndTimeGapInSec(lastRoster, offsetTZMinutes, "SCH"));
		activity->setStartTimeUtcAct(lastRoster->getRestStartUtcAct() + RosterUtils::GetEndTimeGapInSec(lastRoster, offsetTZMinutes, "ACT"));
	}
	else {
		activity->setStartTimeUtcSch(SchDutyUtils::GetDutySchEndTimeUtc(lastRoster->pairing->getLastDuty(), true) + RosterUtils::GetEndTimeGapInSec(lastRoster->pairing->getLastDuty()->getLastSegment(), offsetTZMinutes, "SCH"));

		activity->setStartTimeUtcAct(activity->getStartTimeUtcSch());
		string timeType = GetTimeType(lastRoster->pairing->getLastDuty(), dutyTimeTypeMap);
		if (timeType == "ACT") {
			activity->setStartTimeUtcAct(lastRoster->pairing->getLastDuty()->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(lastRoster->pairing->getLastDuty()->getLastSegment(), offsetTZMinutes, "ACT"));
		}
	}


	//通过headPairing计划时间来计算，获得前半环所在月底时间
	string timeType = GetTimeType(headPairing->getLastDuty(), dutyTimeTypeMap);
	time_t headPairingEndMonthUtcAct = GetHeadPairingEndMonthUtc(headPairing, offsetTZMinutes, timeType);
	time_t headPairingEndMonthUtcSch = GetHeadPairingEndMonthUtc(headPairing, offsetTZMinutes, "SCH");
	
	//设置结束时间为 "前半环结束时间月末"
	activity->setEndTimeUtcSch(headPairingEndMonthUtcSch);
	activity->setEndTimeUtcAct(headPairingEndMonthUtcAct);
	//activity->setEndTimeUtcSch(dbData->scenario.endDtUTC);
	//activity->setEndTimeUtcAct(dbData->scenario.endDtUTC);	

	if (activity->getEndTimeUtcAct() <= activity->getStartTimeUtcAct()) {
		return nullptr;
	}

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	return activity;
}

//针对场景仅有商务机前半环，场景"headPairing结束时间" 到 "前半环结束时间月末"之间，计入Per-Diem时间段
SharedPtr<MandayActivity> CalculatePerDiemHoursInMandayForEvaFdRule::GetPerDiemActivityBetweenHeadPairingAndMonthEndDay(const Pairing* headPairing, const bool isLongPerDiemDutyForHeadPairing, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap) const {

	const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();

	SharedPtr<MandayActivity> activity = std::make_shared<MandayActivity>(MandayActivity::Type::PER_DIEM);


	activity->setStartTimeUtcSch(SchDutyUtils::GetDutySchEndTimeUtc(headPairing->getLastDuty(), true) + RosterUtils::GetEndTimeGapInSec(headPairing->getLastDuty()->getLastSegment(), offsetTZMinutes, "SCH"));
	activity->setStartTimeUtcAct(activity->getStartTimeUtcSch());
	string timeType = GetTimeType(headPairing->getLastDuty(), dutyTimeTypeMap);
	if (timeType == "ACT") {
		activity->setStartTimeUtcAct(headPairing->getLastDuty()->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(headPairing->getLastDuty()->getLastSegment(), offsetTZMinutes, "ACT"));
	}

	//通过headPairing计划时间来计算，获得前半环所在月底时间
	timeType = GetTimeType(headPairing->getLastDuty(), dutyTimeTypeMap);
	time_t headPairingEndMonthUtcAct = GetHeadPairingEndMonthUtc(headPairing, offsetTZMinutes, timeType);
	time_t headPairingEndMonthUtcSch = GetHeadPairingEndMonthUtc(headPairing, offsetTZMinutes, "SCH");

	//设置结束时间为 "前半环结束时间月末"
	activity->setEndTimeUtcSch(headPairingEndMonthUtcSch);
	activity->setEndTimeUtcAct(headPairingEndMonthUtcAct);
	//activity->setEndTimeUtcSch(dbData->scenario.endDtUTC);
	//activity->setEndTimeUtcAct(dbData->scenario.endDtUTC);	

	if (activity->getEndTimeUtcSch() <= activity->getStartTimeUtcSch()) {
		return nullptr;
	}

	activity->setStartTimeLocSch(activity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocSch(activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
	activity->setStartTimeLocAct(activity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
	activity->setEndTimeLocAct(activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

	if (isLongPerDiemDutyForHeadPairing) {
		activity->setSubType(LONG_PERDIEM);
	}
	return activity;
}

CalculatePerDiemHoursInMandayForEvaFdRule::HalfPairingFlag CalculatePerDiemHoursInMandayForEvaFdRule::GetHalfPairingFlagOfBusinessAviation(const Pairing* pairing, const string& crewBase) {
	if (!IsBusinessAviation(pairing)) {
		return CalculatePerDiemHoursInMandayForEvaFdRule::HalfPairingFlag::FULL;
	}

	return GetHalfPairingFlag(pairing, crewBase);
}

CalculatePerDiemHoursInMandayForEvaFdRule::HalfPairingFlag CalculatePerDiemHoursInMandayForEvaFdRule::GetHalfPairingFlag(const Pairing* pairing, const string& crewBase) {
	CalculatePerDiemHoursInMandayForEvaFdRule::HalfPairingFlag halfPairingFlag = CalculatePerDiemHoursInMandayForEvaFdRule::HalfPairingFlag::FULL;
	string pairingDepStation = pairing->getFirstSegment()->getDepStation();
	string pairingArrStation = pairing->getLastSegment()->getArrStation();

	//TPE和TSA认为同一机场
	vector<string> pairingDepStations;
	pairingDepStations.emplace_back(pairingDepStation);
	if (pairingDepStation == "TPE") {
		pairingDepStations.emplace_back("TSA");
	}
	else if (pairingDepStation == "TSA") {
		pairingDepStations.emplace_back("TPE");
	}

	vector<string> pairingArrStations;
	pairingArrStations.emplace_back(pairingArrStation);
	if (pairingArrStation == "TPE") {
		pairingArrStations.emplace_back("TSA");
	}
	else if (pairingArrStation == "TSA") {
		pairingArrStations.emplace_back("TPE");
	}

	if (pairingDepStation == pairingArrStation 
		|| (pairingDepStation == "TPE" && pairingArrStation == "TSA") 
		|| (pairingDepStation == "TSA" && pairingArrStation == "TPE")) {
		halfPairingFlag = CalculatePerDiemHoursInMandayForEvaFdRule::HalfPairingFlag::FULL;
	}
	else if (std::find(pairingDepStations.begin(), pairingDepStations.end(),crewBase) != pairingDepStations.end()) {
		halfPairingFlag = CalculatePerDiemHoursInMandayForEvaFdRule::HalfPairingFlag::HEAD;
	}
	else if (std::find(pairingArrStations.begin(), pairingArrStations.end(), crewBase) != pairingArrStations.end()) {
		halfPairingFlag = CalculatePerDiemHoursInMandayForEvaFdRule::HalfPairingFlag::TAIL;
	}
	return halfPairingFlag;

}


bool CalculatePerDiemHoursInMandayForEvaFdRule::ExistLongPerdiemDuty(const Pairing* pairing, const bool isLongPerDiemDutyForHeadPairing, const SharedPtr<CrewDataContext>& dbData) {
	if (pairing == nullptr) {
		//地面任务
		return isLongPerDiemDutyForHeadPairing ? true : false;
	}
	for (auto& duty : pairing->getDutyVec()) {
		if (DutyUtils::IsLongPerdiem(duty, dbData)) {
			return true;
		}
	}
	return false;
}

//是否商务机
bool CalculatePerDiemHoursInMandayForEvaFdRule::IsBusinessAviation(const Pairing* pairing) const {
	string airline = "BJ";
	auto it = _dbData->systemParamMap.find("BUSINESS_AVIATION_AIRLINE");//商务机航司代码
	if (it != _dbData->systemParamMap.end()) {
		airline = it->second;
	}
	vector<string> airlines;
	split(airline.c_str(), '|', airlines);

	for (auto& duty : pairing->getDutyVec()) {
		for (auto& segment : duty->getSegmentsRead()) {
			if (std::find(airlines.begin(), airlines.end(), segment->getAirline()) != airlines.end()) {
				//航司为BJ为：商务机
				return true;
			}
		}
	}
	return false;
}

CalculatePerDiemHoursInMandayForEvaFdRule::SpecialPairingFlag CalculatePerDiemHoursInMandayForEvaFdRule::GetSpecialPairingFlag(const ROSTER* roster, const Pairing* pairing) const {
	SpecialPairingFlag flag = SpecialPairingFlag::NOT_SPECAIL;

	auto segments = const_cast<Pairing*>(pairing)->getSegments();
	if (segments.size() <= 2) {
		return SpecialPairingFlag::NOT_SPECAIL;
	}

	auto firstSegment = pairing->getFirstSegment();
	auto lastSegment = pairing->getLastSegment();
	set<string> transportAssignments = { "TRAIN","BUS","TAXI","CAR","HSR" };
	if ((transportAssignments.find(firstSegment->getAssignment()) != transportAssignments.end() || transportAssignments.find(lastSegment->getAssignment()) != transportAssignments.end())
			&& firstSegment->getDepStationRead() == lastSegment->getArrStationRead()) {
		return SpecialPairingFlag::OUTER_BASE;
	}
	return flag;
}

//bool CalculatePerDiemHoursInMandayForEvaFdRule::IsCountedPerDeimForSpecialPairing(const ROSTER* roster, const Pairing* pairing, const Duty* currDuty, const SpecialPairingFlag specialPairingFlag) const {
//	auto firstDuty = pairing->getFirstDuty();
//	auto lastDuty = pairing->getLastDuty();
//	if (specialPairingFlag == SpecialPairingFlag::OUTER_BASE_FIRST_FLY || specialPairingFlag == SpecialPairingFlag::OUTER_BASE_FIRST_NOT_FLY) {
//		if (firstDuty->getDutyId() == currDuty->getDutyId() || lastDuty->getDutyId() == currDuty->getDutyId()) {
//			//首尾Duty，计入Perdeim
//			return true;
//		}
//
//		//针对中间Duty进行判断
//		if (currDuty->getAssignment() == "FLY" || currDuty->getAssignment() == "MVO") {
//			//飞行任务，若是学员不计入PerDiem
//			vector<long long> flightIds;
//			for (auto& segment : currDuty->getSegments()) {
//				flightIds.emplace_back(segment->getDBId());
//			}
//			TrainingRoleMatchExpression<Activity> trainingRoleMatch;
//			trainingRoleMatch.SetExpression("TE", this);
//			if (trainingRoleMatch.Match(*roster, flightIds)) {
//				return false;
//			}
//		}
//		else {
//			//非飞行任务Duty，不计入Perdeim
//			return false;
//		}
//	}
//	return true;
//}

bool CalculatePerDiemHoursInMandayForEvaFdRule::IsCourseLineTrainee(const ROSTER* roster, const Duty* duty) {
	auto& tmProgramCourseIndex = _dbData->tmProgramCourseIndex;
	for (auto& segment : duty->getSegmentsRead()) {
		auto tmProgramCourse = tmProgramCourseIndex->getByRosterId(roster->rosterId, segment->getDBId());
		if (tmProgramCourse == nullptr) {
			continue;
		}
		auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, _dbData);
		if (tmCourse != nullptr && tmCourse->courseType == "LINE") {
			return true;
		}
	}
	return false;
}

string CalculatePerDiemHoursInMandayForEvaFdRule::GetTimeType(const Duty* duty, const int offsetTZMinutes, const PerDiemHoursForEvaFdRuleParam& ruleParam) const {
	if (ruleParam._perDiemDelayBuffer == RuleParamConstant::IGNORED) {
		return string("SCH");
	}
	//判断Duty最后航班落地时间是否延误，若延误大于30分钟，则采用实际时间来计算 实际PerDiem。
	bool isDelay = (int)(duty->getLastSegment()->getEndTimeUtcAct() - duty->getLastSegment()->getEndTimeUtcSch()) >= (ruleParam._perDiemDelayBufferMinutes * 60);
	return isDelay ? string("ACT") : string("SCH");
}

string CalculatePerDiemHoursInMandayForEvaFdRule::GetTimeType(const Duty* duty, const map<long long, string>& dutyTimeTypeMap) const {
	auto iter = dutyTimeTypeMap.find(duty->getDutyId());
	if (iter == dutyTimeTypeMap.end()) {
		return "SCH";
	}
	return iter->second;
}

void CalculatePerDiemHoursInMandayForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(PerDiemHoursForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(PerDiemHoursForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}
