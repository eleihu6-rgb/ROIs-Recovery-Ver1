#include "CalculateFreighterCreditHoursInMandayForEvaFdRule.h"
#include <cfloat>
#include <algorithm>
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/NumberUtils.h"
#include "../utils/SchDutyUtils.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/TmProgramIndex.h"

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

inline static int GetFirstMonthCredit(const std::shared_ptr<MandayActivity>& mandayActivity, const time_t firstMonthStartTimeUtc, const SharedPtr<CrewDataContext>& dbData, const int offsetTZMinutes, const string& timeType) {
	time_t startTimeInUtc = mandayActivity->getStartTimeUtc(timeType);
	time_t endTimeInUtc = mandayActivity->getEndTimeUtc(timeType);

	int firstMonthDuration = 0; //二个Duty之间若存在跨月，则需要计算切分后first month per-diem的时长
	//按月切分，计算切分到第一个月PH
	if (TimeUtils::IsSameMonth(startTimeInUtc, firstMonthStartTimeUtc, offsetTZMinutes) && TimeUtils::IsSameMonth(startTimeInUtc, endTimeInUtc, offsetTZMinutes)) {
		//场景1: startTimeUtc和endTimeUtc在首月firstMonth
		firstMonthDuration = static_cast<int>(endTimeInUtc - startTimeInUtc);
	}
	else if (TimeUtils::IsSameMonth(startTimeInUtc, firstMonthStartTimeUtc, offsetTZMinutes) && !TimeUtils::IsSameMonth(startTimeInUtc, endTimeInUtc, offsetTZMinutes)) {
		//场景2: startTimeUtc在首月firstMonth，endTimeUtc在第二个月

		//"开始时间"和"结束时间"不在一个月，获得“结束时间”所在月份的第一个天0点（即所在月份开始时间）
		time_t monthStartInUtc = Utility::GetInstancePtr()->getLocalMonthStartInUTC(endTimeInUtc, offsetTZMinutes);
		firstMonthDuration = static_cast<int>(monthStartInUtc - startTimeInUtc);
	}
	return firstMonthDuration;
}

//返回值：map<roserId, Pairing/Roster Credit(分钟数)>
inline static map<long long, CreditHour> GetRosterPairingCredit(const vector<std::shared_ptr<MandayActivity>>& allSegmentMandayActivities, const map<long long, std::tuple<long long, const ROSTER*>>& rosterAndPairingIdMap, const SharedPtr<CrewDataContext>& dbData, const int offsetTZMinutes) {
	map<long long, CreditHour> resultRosterCreditMap;//map<roserId, Pairing Credit(分钟数)>
	for (auto& mandayActivity : allSegmentMandayActivities) {

		long long rosterId = mandayActivity->getRosterId();
		long long pairingId = mandayActivity->getPairingId();

		ROSTER* roster = nullptr;

		if (pairingId != 0) {  //针对Pairing分配到crew后，对应roster的credit
			//pairingId转换成rosterId
			auto iterRoster = rosterAndPairingIdMap.find(pairingId);
			if (iterRoster != rosterAndPairingIdMap.end()) {
				rosterId = std::get<0>(iterRoster->second);
				roster = const_cast<ROSTER*>(std::get<1>(iterRoster->second));
			}
		}

		//计算单个mandayActivity的credit值
		double actCredit = static_cast<double>(mandayActivity->getEndTimeUtc("ACT") - mandayActivity->getStartTimeUtc("ACT"));
		double schCredit = static_cast<double>(mandayActivity->getEndTimeUtc("SCH") - mandayActivity->getStartTimeUtc("SCH"));

		time_t actFirstMonthStartTimeUtc = 0;
		time_t schFirstMonthStartTimeUtc = 0;
		if (roster == nullptr) {
			//异常场景：Roster不存在时，采用mandayActivity的开始时间作为首月基准
			actFirstMonthStartTimeUtc = mandayActivity->getStartTimeUtcAct();
			schFirstMonthStartTimeUtc = mandayActivity->getStartTimeUtcSch();
		}
		else if (roster->pairing == nullptr) {
			//地面任务(Pairing不存在时)，采用roster的开始时间作为首月基准
			actFirstMonthStartTimeUtc = roster->getStartTimeUtcAct();
			schFirstMonthStartTimeUtc = roster->getStartTimeUtcSch();
		}
		else {
			actFirstMonthStartTimeUtc = roster->pairing->getFirstDuty()->getStartTimeUtcAct();
			schFirstMonthStartTimeUtc = SchDutyUtils::GetDutySchStartTimeUtc(roster->pairing->getFirstDuty());
		}
		double actFmCredit = GetFirstMonthCredit(mandayActivity, actFirstMonthStartTimeUtc, dbData, offsetTZMinutes, "ACT");
		double schFmCredit = GetFirstMonthCredit(mandayActivity, schFirstMonthStartTimeUtc, dbData, offsetTZMinutes, "SCH");
		if (mandayActivity->getPercent() >= 0) {
			actCredit *= mandayActivity->getPercent();
			actFmCredit *= mandayActivity->getPercent();
			schCredit *= mandayActivity->getPercent();
			schFmCredit *= mandayActivity->getPercent();
		}
		if (mandayActivity->getMultiple() >= 0) {
			actCredit *= mandayActivity->getMultiple();
			actFmCredit *= mandayActivity->getMultiple();
			schCredit *= mandayActivity->getMultiple();
			schFmCredit *= mandayActivity->getMultiple();
		}

		//按rosterId合并credit hour
		auto iterCredit = resultRosterCreditMap.find(rosterId);
		if (iterCredit == resultRosterCreditMap.end()) {
			CreditHour pairingCreditHour;
			pairingCreditHour.actCreditInMins = actCredit;
			pairingCreditHour.schCreditInMins = schCredit;
			pairingCreditHour.actFirstMonthCreditInMins = actFmCredit;
			pairingCreditHour.schFirstMonthCreditInMins = schFmCredit;
			pairingCreditHour.pairingId = pairingId;
			pairingCreditHour.rosterId = rosterId;
			resultRosterCreditMap.insert(std::make_pair(rosterId, pairingCreditHour));//此处credit单位为秒
		}
		else {
			auto& pairingCreditHour = iterCredit->second;
			pairingCreditHour.actCreditInMins += actCredit;//此处credit单位为秒
			pairingCreditHour.schCreditInMins += schCredit;//此处credit单位为秒
			pairingCreditHour.actFirstMonthCreditInMins += actFmCredit;  //此处credit单位为秒
			pairingCreditHour.schFirstMonthCreditInMins += schFmCredit;  //此处credit单位为秒
		}
	}

	for (auto& pair : resultRosterCreditMap) {
		auto& pairingCreditHour = pair.second;
		pairingCreditHour.actCreditInMins = pairingCreditHour.actCreditInMins / 60; //转成分钟
		pairingCreditHour.actFirstMonthCreditInMins = pairingCreditHour.actFirstMonthCreditInMins / 60; //转成分钟
		pairingCreditHour.schCreditInMins = pairingCreditHour.schCreditInMins / 60; //转成分钟
		pairingCreditHour.schFirstMonthCreditInMins = pairingCreditHour.schFirstMonthCreditInMins / 60; //转成分钟
	}
	return resultRosterCreditMap;
}

inline static map<long long, map<long long, CreditHour>> GetRosterSegmentCredit(const vector<std::shared_ptr<MandayActivity>>& allSegmentMandayActivities, const map<long long, std::tuple<long long, const ROSTER*>>& rosterAndPairingIdMap, const map<long long, Segment*>& segmentIdMap, const SharedPtr<CrewDataContext>& dbData, const int offsetTZMinutes) {
	map<long long, map<long long, CreditHour>> resultSegmentCreditMap;//map<roserId, map<segmentId,Segment Credit(分钟数)>>
	for (auto& mandayActivity : allSegmentMandayActivities) {

		long long rosterId = mandayActivity->getRosterId();
		long long pairingId = mandayActivity->getPairingId();
		

		if (pairingId != 0) {  //针对Pairing分配到crew后，对应roster的credit
			long long segmentId = mandayActivity->getSegmentId();
			//pairingId转换成rosterId
			auto iterRoster = rosterAndPairingIdMap.find(pairingId);
			if (iterRoster != rosterAndPairingIdMap.end()) {
				rosterId = std::get<0>(iterRoster->second);
			}

			//计算单个mandayActivity的credit值
			double actCredit = static_cast<double>(mandayActivity->getEndTimeUtc("ACT") - mandayActivity->getStartTimeUtc("ACT"));
			double schCredit = static_cast<double>(mandayActivity->getEndTimeUtc("SCH") - mandayActivity->getStartTimeUtc("SCH"));

			auto iterSegment = segmentIdMap.find(segmentId);
			long long flightId = segmentId;
			time_t actFirstMonthStartTimeUtc = 0;
			time_t schFirstMonthStartTimeUtc = 0;
			if (iterSegment == segmentIdMap.end()) {
				//Pairing不存在时，采用mandayActivity的开始时间作为首月基准
				actFirstMonthStartTimeUtc = mandayActivity->getStartTimeUtcAct();
				schFirstMonthStartTimeUtc = mandayActivity->getStartTimeUtcSch();
			}
			else {
				actFirstMonthStartTimeUtc = iterSegment->second->getStartTimeUtcAct();
				schFirstMonthStartTimeUtc = iterSegment->second->getStartTimeUtcSch();
				flightId = iterSegment->second->getDBId();
			}
			double actFmCredit = GetFirstMonthCredit(mandayActivity, actFirstMonthStartTimeUtc, dbData, offsetTZMinutes, "ACT");
			double schFmCredit = GetFirstMonthCredit(mandayActivity, schFirstMonthStartTimeUtc, dbData, offsetTZMinutes, "ACT");
			if (mandayActivity->getPercent() >= 0) {
				actCredit *= mandayActivity->getPercent();
				actFmCredit *= mandayActivity->getPercent();
				schCredit *= mandayActivity->getPercent();
				schFmCredit *= mandayActivity->getPercent();
			}
			if (mandayActivity->getMultiple() >= 0) {
				actCredit *= mandayActivity->getMultiple();
				actFmCredit *= mandayActivity->getMultiple();
				schCredit *= mandayActivity->getMultiple();
				schFmCredit *= mandayActivity->getMultiple();
			}

			//按rosterId合并credit hour
			auto iterCredit = resultSegmentCreditMap.find(rosterId);
			if (iterCredit == resultSegmentCreditMap.end()) {
				CreditHour segmentCreditHour;
				segmentCreditHour.actCreditInMins = actCredit;
				segmentCreditHour.schCreditInMins = schCredit;
				segmentCreditHour.actFirstMonthCreditInMins = actFmCredit;
				segmentCreditHour.schFirstMonthCreditInMins = schFmCredit;
				segmentCreditHour.pairingId = pairingId;
				segmentCreditHour.rosterId = rosterId;
				segmentCreditHour.segmentId = segmentId;
				segmentCreditHour.flightId = flightId;
				map<long long, CreditHour> segmentMap;
				segmentMap.insert(std::make_pair(segmentId, segmentCreditHour));
				resultSegmentCreditMap.insert(std::make_pair(rosterId, segmentMap));//此处credit单位为秒
			}
			else {
				auto& segmentMap = iterCredit->second;
				auto iterSegment = segmentMap.find(segmentId);
				if (iterSegment == segmentMap.end()) {
					CreditHour segmentCreditHour;
					segmentCreditHour.actCreditInMins = actCredit;
					segmentCreditHour.schCreditInMins = schCredit;
					segmentCreditHour.actFirstMonthCreditInMins = actFmCredit;
					segmentCreditHour.schFirstMonthCreditInMins = schFmCredit;
					segmentCreditHour.pairingId = pairingId;
					segmentCreditHour.rosterId = rosterId;
					segmentCreditHour.segmentId = segmentId;
					segmentCreditHour.flightId = flightId;
					segmentMap.insert(std::make_pair(segmentId, segmentCreditHour));
				}
				else {
					auto& segmentCreditHour = iterSegment->second;
					segmentCreditHour.actCreditInMins += actCredit;//相同Segment合计在一起，此处credit单位为秒
					segmentCreditHour.actCreditInMins += schCredit;//相同Segment合计在一起，此处credit单位为秒
					segmentCreditHour.actFirstMonthCreditInMins += actFmCredit;  //相同Segment合计在一起，此处credit单位为秒
					segmentCreditHour.schFirstMonthCreditInMins += schFmCredit;  //相同Segment合计在一起，此处credit单位为秒
				}
			}
		}
	}

	for (auto& pair : resultSegmentCreditMap) {
		auto& segmentMap = pair.second;
		for (auto& pairSegment : segmentMap) {
			auto& pairingCreditHour = pairSegment.second;
			pairingCreditHour.actCreditInMins = pairingCreditHour.actCreditInMins / 60; //转成分钟
			pairingCreditHour.actFirstMonthCreditInMins = pairingCreditHour.actFirstMonthCreditInMins / 60; //转成分钟
			pairingCreditHour.schCreditInMins = pairingCreditHour.schCreditInMins / 60; //转成分钟
			pairingCreditHour.schFirstMonthCreditInMins = pairingCreditHour.schFirstMonthCreditInMins / 60; //转成分钟
		}
	}
	return resultSegmentCreditMap;
}

//resultCrewMandayDay: map<本地时间天,MandayCredit当天时长合计(单位：分钟)>
//allAssignmentMapCrewMandayDay: 通过Assignment分组后的按天切分的credit时长，map<assignment, map<本地时间天, tuple<当天credit时长合计(实际时间),当天credit时长合计(计划时间)>>>
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

//返回值：计算manday的Credit Hour, std::tuple<map<localDay,MandayCredit(分钟数)>, map<rosterId,Pairing Credit(分钟数)>, map<rosterId, map<segmentId,Segment Credit(分钟数)>>>
std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>> CalculateFreighterCreditHoursInMandayForEvaFdRule::Calculate(std::vector<const ROSTER*>& rosters) {
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

	double credit = 0;
	auto allProgramList = this->_dbData->tmProgramIndex->getByCrewId(crew->idCrew);
	map<long long, std::tuple<long long, const ROSTER*>> rosterAndPairingIdMap; //map<pairingId, std::tuple<rosterId, Pairing*>>
	map<long long, Segment*> segmentIdMap; //map<segmentId,Segment*>
	//按规则的匹配参数进行分组
	map<const RuleParam*, vector<const Activity*>> ruleActivityMap;
	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}

		rosterAndPairingIdMap.insert(std::make_pair(roster->pairing->getDbId(), std::make_tuple(roster->rosterId, roster)));
		for (auto& duty : roster->pairing->getDutyVec()) {
			for (auto& segment : duty->getSegments()) {
				segmentIdMap.insert(std::make_pair(segment->getSegmentId(), segment));
				for (const auto& ruleParam : _ruleParams) {
					if (ruleParam.MatchParam(roster, duty, segment, allProgramList, offsetTZMinutes)) {
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

	//合并credit
	vector<std::shared_ptr<MandayActivity>> allSegmentMandayActivities;
	map<string, map<time_t, std::tuple<double,double>>> allAssignmentMapCrewMandayDay; //通过Assignment分组后的按天切分的credit时长，map<assignment, map<本地时间天, tuple<当天credit时长合计(实际时间),当天credit时长合计(计划时间)>>>
	map<time_t, MandayCreditHour> resultCrewMandayDay; //map<本地时间天,MandayCredit当天时长合计(单位：分钟)>
	for (auto& ruleActivity : ruleActivityMap) {
		auto tmpMapCrewMandayDay = CalculateCreditDay(allSegmentMandayActivities, allAssignmentMapCrewMandayDay, ruleActivity.second, offsetTZMinutes, crew, *(FreighterCreditHoursDefinitionForEvaFdRuleParam*)(ruleActivity.first));
		for (auto& tmpCrewMandayDay : tmpMapCrewMandayDay) {
			auto iterResult = resultCrewMandayDay.find(tmpCrewMandayDay.first);
			if (iterResult == resultCrewMandayDay.end()) {
				MandayCreditHour mandayCredit;
				mandayCredit.actCreditInMins = std::get<0>(tmpCrewMandayDay.second);
				mandayCredit.schCreditInMins = std::get<1>(tmpCrewMandayDay.second);
				resultCrewMandayDay.insert(std::make_pair(tmpCrewMandayDay.first, mandayCredit));
			}
			else {
				auto& mandayCredit = iterResult->second;
				mandayCredit.actCreditInMins += std::get<0>(tmpCrewMandayDay.second);
				mandayCredit.schCreditInMins += std::get<1>(tmpCrewMandayDay.second);
			}
		}
	}
	//通过allSegmentMandayActivities设置roster的creditMinutes
	map<long long, CreditHour> resultRosterCreditMap = GetRosterPairingCredit(allSegmentMandayActivities, rosterAndPairingIdMap, this->_dbData, offsetTZMinutes);//map<roserId, Pairing Credit(分钟数)>
	map<long long, map<long long, CreditHour>> resultSegmentCreditMap = GetRosterSegmentCredit(allSegmentMandayActivities, rosterAndPairingIdMap, segmentIdMap, this->_dbData, offsetTZMinutes);//map<roserId, Segment Credit(分钟数)>

	//allAssignmentMapCrewMandayDay结构转换按localDay合并到resultCrewMandayDay
	MergeAssignmentCrewMandayDay(resultCrewMandayDay, allAssignmentMapCrewMandayDay);

	return std::make_tuple(resultCrewMandayDay, resultRosterCreditMap, resultSegmentCreditMap);
}

//通过飞时计算Credit
vector<std::shared_ptr<MandayActivity>> CalculateFreighterCreditHoursInMandayForEvaFdRule::GetCreditActivityByBLH(const vector<const Activity*>& activities, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam) {
	vector<std::shared_ptr<MandayActivity>> mandayActivities;

	//activity为 ROSTER或Segment对象
	for (auto& activity : activities) {
		//用于计算时间类型，SCH或者ACT
		string timeType = GetTimeType(activity, offsetTZMinutes, ruleParam);

		std::shared_ptr<MandayActivity> mandayActivity = std::make_shared<MandayActivity>(MandayActivity::Type::CREDIT);
		mandayActivity->setSplitMethod(ruleParam._splitMethod);

		if (typeid(*activity) == typeid(Segment)) {
			Segment* segment = (Segment*)activity;
			mandayActivity->setPairingId(segment->getPairingId());
			mandayActivity->setDutyId(segment->getDutyId());
			mandayActivity->setSegmentId(segment->getSegmentId());
			mandayActivity->setRosterId(0);
			mandayActivity->setAssignment(segment->getAssignment());
		}
		else if (typeid(*activity) == typeid(ROSTER)) {
			ROSTER* roster = (ROSTER*)activity;
			mandayActivity->setPairingId(0);
			mandayActivity->setRosterId(roster->rosterId);
			mandayActivity->setAssignment(roster->qualifier);
		}

		//int blhInSecs = static_cast<int>(activity->getCalcEndTimeUtc("ACT") - activity->getCalcStartTimeUtc("ACT"));
		//blhInSecs += ruleParam._creditBtGapMinutes * 60;
		//credit += (int)round((blhInSecs * 1.0 / 60) * ruleParam._creditPercent * ruleParam._creditMultiple);
		mandayActivity->setStartTimeUtcSch(activity->getStartTimeUtcSch());
		mandayActivity->setEndTimeUtcSch(activity->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(activity, offsetTZMinutes, "SCH"));
		mandayActivity->setStartTimeUtcAct(timeType == "ACT" ? activity->getStartTimeUtcAct() : activity->getStartTimeUtcSch());//Credit计算采用计划时间，航班延误超过30分钟则采用实际时间。
		mandayActivity->setEndTimeUtcAct((timeType == "ACT" ? activity->getEndTimeUtcAct() : activity->getEndTimeUtcSch()) + RosterUtils::GetEndTimeGapInSec(activity, offsetTZMinutes, timeType));

		mandayActivity->setStartTimeLocSch(mandayActivity->getStartTimeUtcSch() + (time_t)offsetTZMinutes*60);
		mandayActivity->setEndTimeLocSch(mandayActivity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		mandayActivity->setStartTimeLocAct(mandayActivity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
		mandayActivity->setEndTimeLocAct(mandayActivity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

		mandayActivity->setPercent(ruleParam._creditPercent);
		mandayActivity->setMultiple(ruleParam._creditMultiple);

		mandayActivities.emplace_back(mandayActivity);

		//添加_creditBtGapMinutes
		if (ruleParam._creditBtGapMinutes > 0) {
			mandayActivities.emplace_back(GetCreditActivityForCreditBtGap(activity, offsetTZMinutes, ruleParam, true));
		}
		
	}
	return mandayActivities;
}

vector<std::shared_ptr<MandayActivity>> CalculateFreighterCreditHoursInMandayForEvaFdRule::GetCreditActivityByAvgGuaranteeHour(const vector<const Activity*>& activities, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam) {
	vector<std::shared_ptr<MandayActivity>> mandayActivities;

	//activity为 ROSTER或Segment对象
	for (auto& activity : activities) {
		//用于计算时间类型，SCH或者ACT
		string timeType = GetTimeType(activity, offsetTZMinutes, ruleParam);

		std::shared_ptr<MandayActivity> mandayActivity = std::make_shared<MandayActivity>(MandayActivity::Type::CREDIT);
		mandayActivity->setSplitMethod(ruleParam._splitMethod);

		if (typeid(*activity) == typeid(ROSTER)) {
			ROSTER* roster = (ROSTER*)activity;
			mandayActivity->setRosterId(roster->rosterId);
			mandayActivity->setPairingId(0);
			mandayActivity->setAssignment(roster->qualifier);
		}
		else if (typeid(*activity) == typeid(Segment)) {
			Segment* segment = (Segment*)activity;
			mandayActivity->setPairingId(segment->getPairingId());
			mandayActivity->setDutyId(segment->getDutyId());
			mandayActivity->setSegmentId(segment->getSegmentId());
			mandayActivity->setRosterId(0);
			mandayActivity->setAssignment(segment->getAssignment());
		}

		mandayActivity->setStartTimeUtcSch(activity->getStartTimeUtcSch());
		mandayActivity->setEndTimeUtcSch(activity->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(activity, offsetTZMinutes, "SCH"));
		mandayActivity->setStartTimeUtcAct(timeType == "ACT" ? activity->getStartTimeUtcAct() : activity->getStartTimeUtcSch());
		mandayActivity->setEndTimeUtcAct((timeType == "ACT" ? activity->getEndTimeUtcAct() : activity->getEndTimeUtcSch()) + RosterUtils::GetEndTimeGapInSec(activity, offsetTZMinutes, timeType));

		mandayActivity->setStartTimeLocSch(mandayActivity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		mandayActivity->setEndTimeLocSch(mandayActivity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		mandayActivity->setStartTimeLocAct(mandayActivity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
		mandayActivity->setEndTimeLocAct(mandayActivity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

		mandayActivity->setPercent(ruleParam._creditPercent);
		mandayActivity->setMultiple(ruleParam._creditMultiple);

		mandayActivities.emplace_back(mandayActivity);

		////添加_creditBtGapMinutes
		//if (ruleParam._creditBtGapMinutes > 0) {
		//	mandayActivities.emplace_back(GetCreditActivityForCreditBtGap(activity, crew, ruleParam, true));
		//}

	}
	return mandayActivities;
}

/*
地面任务Credit计算使用公式
“以「天」計算，一天最多4Hr
If當天累計duty Hr > 4 then 4 Hr
If當天累計duty Hr <= 4 then 2 Hr”
*/
vector<std::shared_ptr<MandayActivity>> CalculateFreighterCreditHoursInMandayForEvaFdRule::GetCreditActivityByGround(const vector<const Activity*>& activities, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam) {
	vector<std::shared_ptr<MandayActivity>> mandayActivities;

	//int credit = 0;//分钟数
	//int workTime = 0;
	for (auto& activity : activities) {
		if (typeid(*activity) != typeid(ROSTER)) {
			continue;
		}
		const ROSTER* roster = (const ROSTER *)activity;
		//workTime += static_cast<int>(roster->getCalcEndTimeUtc("ACT") - roster->getCalcStartTimeUtc("ACT"));

		//用于计算时间类型，SCH或者ACT
		string timeType = GetTimeType(activity, offsetTZMinutes, ruleParam);

		std::shared_ptr<MandayActivity> mandayActivity = std::make_shared<MandayActivity>(MandayActivity::Type::CREDIT);
		mandayActivity->setSplitMethod(ruleParam._splitMethod);
		mandayActivity->setRosterId(roster->rosterId);
		mandayActivity->setPairingId(0);
		mandayActivity->setAssignment(roster->qualifier);

		//int blhInSecs = static_cast<int>(activity->getCalcEndTimeUtc("ACT") - activity->getCalcStartTimeUtc("ACT"));
		//blhInSecs += ruleParam._creditBtGapMinutes * 60;
		//credit += (int)round((blhInSecs * 1.0 / 60) * ruleParam._creditPercent * ruleParam._creditMultiple);

		mandayActivity->setStartTimeUtcSch(roster->getStartTimeUtcSch());
		mandayActivity->setEndTimeUtcSch(roster->getRestStartUtcSch() + RosterUtils::GetEndTimeGapInSec(activity, offsetTZMinutes, "SCH"));
		mandayActivity->setStartTimeUtcAct(timeType == "ACT" ? roster->getStartTimeUtcAct() : roster->getStartTimeUtcSch());
		mandayActivity->setEndTimeUtcAct((timeType == "ACT" ? roster->getRestStartUtcAct() : roster->getRestStartUtcSch()) + RosterUtils::GetEndTimeGapInSec(activity, offsetTZMinutes, timeType));

		mandayActivity->setStartTimeLocSch(mandayActivity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		mandayActivity->setEndTimeLocSch(mandayActivity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		mandayActivity->setStartTimeLocAct(mandayActivity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
		mandayActivity->setEndTimeLocAct(mandayActivity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

		mandayActivity->setPercent(ruleParam._creditPercent);
		mandayActivity->setMultiple(ruleParam._creditMultiple);

		mandayActivities.emplace_back(mandayActivity);

		////添加_creditBtGapMinutes
		//if (ruleParam._creditBtGapMinutes > 0) {
		//	mandayActivities.emplace_back(GetCreditActivityForCreditBtGap(activity, offsetTZMinutes, ruleParam, true));
		//}
	}
	//if (workTime <= 4 * 60 * 60) {
	//	//当天累计小于等于4小时，则为2小时
	//	credit = 2 * 60;
	//}
	//else {
	//	//当天累计大于4小时，则为4小时
	//	credit = 4 * 60;
	//}
	//credit = (int)round((credit + ruleParam._creditBtGapMinutes) * ruleParam._creditPercent * ruleParam._creditMultiple);
	return mandayActivities;
}

vector<std::shared_ptr<MandayActivity>> CalculateFreighterCreditHoursInMandayForEvaFdRule::GetCreditActivityByFixedDuration(const vector<const Activity*>& activities, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam) {
	vector<std::shared_ptr<MandayActivity>> mandayActivities;

	for (auto& activity : activities) {
		int durationInSec = TimeUtils::hhmmToMinutes(ruleParam._creditExpression) * 60;

		//用于计算时间类型，SCH或者ACT
		string timeType = GetTimeType(activity, offsetTZMinutes, ruleParam);

		std::shared_ptr<MandayActivity> mandayActivity = std::make_shared<MandayActivity>(MandayActivity::Type::CREDIT);
		mandayActivity->setSplitMethod(ruleParam._splitMethod);

		if (typeid(*activity) == typeid(ROSTER)) {
			ROSTER* roster = (ROSTER*)activity;
			mandayActivity->setPairingId(0);
			mandayActivity->setRosterId(roster->rosterId);
			mandayActivity->setAssignment(roster->qualifier);

			mandayActivity->setStartTimeUtcSch(roster->getStartTimeUtcSch());
			mandayActivity->setEndTimeUtcSch(mandayActivity->getStartTimeUtcSch() + durationInSec);
			mandayActivity->setStartTimeUtcAct(timeType == "ACT" ? roster->getStartTimeUtcAct() : roster->getStartTimeUtcSch());
			mandayActivity->setEndTimeUtcAct(mandayActivity->getStartTimeUtcAct() + durationInSec);
		}
		else if (typeid(*activity) == typeid(Segment)) {
			Segment* segment = (Segment*)activity;
			mandayActivity->setPairingId(segment->getPairingId());
			mandayActivity->setDutyId(segment->getDutyId());
			mandayActivity->setSegmentId(segment->getSegmentId());
			mandayActivity->setRosterId(0);
			mandayActivity->setAssignment(segment->getAssignment());

			mandayActivity->setStartTimeUtcSch(activity->getStartTimeUtcSch());
			mandayActivity->setEndTimeUtcSch(mandayActivity->getStartTimeUtcSch() + durationInSec);
			mandayActivity->setStartTimeUtcAct(timeType == "ACT" ? activity->getStartTimeUtcAct() : activity->getStartTimeUtcSch());
			mandayActivity->setEndTimeUtcAct(mandayActivity->getStartTimeUtcAct() + durationInSec);
		}

		mandayActivity->setStartTimeLocSch(mandayActivity->getStartTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		mandayActivity->setEndTimeLocSch(mandayActivity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60);
		mandayActivity->setStartTimeLocAct(mandayActivity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60);
		mandayActivity->setEndTimeLocAct(mandayActivity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60);

		mandayActivity->setPercent(ruleParam._creditPercent);
		mandayActivity->setMultiple(ruleParam._creditMultiple);

		mandayActivities.emplace_back(mandayActivity);

		//添加_creditBtGapMinutes
		if (ruleParam._creditBtGapMinutes > 0) {
			mandayActivities.emplace_back(GetCreditActivityForCreditBtGap(activity, offsetTZMinutes, ruleParam, true));
		}
	}
	return mandayActivities;
}

std::shared_ptr<MandayActivity> CalculateFreighterCreditHoursInMandayForEvaFdRule::GetCreditActivityForCreditBtGap(const Activity* activity, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam, const bool isStartTime) {
	//法规参数中btGapMinutes，计入Credit。时间段放入Roster结束时间所在的天？？？//TODO 这里存在疑问

	std::shared_ptr<MandayActivity> mandayActivity = std::make_shared<MandayActivity>(MandayActivity::Type::CREDIT);
	
	time_t baseActStartTimeLocDay = -1, baseActStartTimeUtcDay = -1;
	time_t baseSchStartTimeLocDay = -1, baseSchStartTimeUtcDay = -1;
	if (isStartTime) {
		//实际时间
		time_t actStartTimeLoc = activity->getStartTimeUtc("ACT") + (time_t)offsetTZMinutes * 60;//本地时间

		baseActStartTimeLocDay = TimeUtils::Truncate(actStartTimeLoc, ChronoUnit::DAYS); //本地时间天
		baseActStartTimeUtcDay = baseActStartTimeLocDay - (time_t)offsetTZMinutes * 60; //UTC时间天

		//计划时间
		time_t schStartTimeLoc = activity->getStartTimeUtc("SCH") + (time_t)offsetTZMinutes * 60;//本地时间

		baseSchStartTimeLocDay = TimeUtils::Truncate(schStartTimeLoc, ChronoUnit::DAYS); //本地时间天
		baseSchStartTimeUtcDay = baseSchStartTimeLocDay - (time_t)offsetTZMinutes * 60; //UTC时间天
	}
	else {
		//实际时间
		time_t actEndTimeLoc = activity->getEndTimeUtc("ACT") + RosterUtils::GetEndTimeGapInSec(activity, offsetTZMinutes, "ACT") + (time_t)offsetTZMinutes * 60;//本地时间

		baseActStartTimeLocDay = TimeUtils::Truncate(actEndTimeLoc, ChronoUnit::DAYS); //本地时间天
		baseActStartTimeUtcDay = baseActStartTimeLocDay - (time_t)offsetTZMinutes * 60; //UTC时间天

		//计划时间
		time_t schEndTimeLoc = activity->getEndTimeUtc("SCH") + RosterUtils::GetEndTimeGapInSec(activity, offsetTZMinutes, "SCH") + (time_t)offsetTZMinutes * 60;//本地时间

		baseSchStartTimeLocDay = TimeUtils::Truncate(schEndTimeLoc, ChronoUnit::DAYS); //本地时间天
		baseSchStartTimeUtcDay = baseSchStartTimeLocDay - (time_t)offsetTZMinutes * 60; //UTC时间天
	}

	mandayActivity->setSplitMethod(ruleParam._splitMethod);

	mandayActivity->setStartTimeLocSch(baseSchStartTimeLocDay);
	mandayActivity->setEndTimeLocSch(baseSchStartTimeLocDay + (time_t)ruleParam._creditBtGapMinutes * 60);
	mandayActivity->setStartTimeLocAct(baseActStartTimeLocDay);
	mandayActivity->setEndTimeLocAct(baseActStartTimeLocDay + (time_t)ruleParam._creditBtGapMinutes * 60);

	mandayActivity->setStartTimeUtcSch(baseSchStartTimeUtcDay);
	mandayActivity->setEndTimeUtcSch(baseSchStartTimeUtcDay + (time_t)ruleParam._creditBtGapMinutes * 60);
	mandayActivity->setStartTimeUtcAct(baseActStartTimeUtcDay);
	mandayActivity->setEndTimeUtcAct(baseActStartTimeUtcDay + (time_t)ruleParam._creditBtGapMinutes * 60);

	mandayActivity->setPercent(ruleParam._creditPercent);
	mandayActivity->setMultiple(ruleParam._creditMultiple);

	if (typeid(activity) == typeid(Segment)) {
		Segment* segment = (Segment*)activity;
		mandayActivity->setPairingId(segment->getPairingId());
		mandayActivity->setDutyId(segment->getDutyId());
		mandayActivity->setSegmentId(segment->getSegmentId());
		mandayActivity->setRosterId(0);
		mandayActivity->setAssignment(segment->getAssignment());
	}
	else if (typeid(activity) == typeid(ROSTER)) {
		ROSTER* roster = (ROSTER*)activity;
		mandayActivity->setPairingId(0);
		mandayActivity->setRosterId(roster->rosterId);
		mandayActivity->setAssignment(roster->qualifier);
	}
	return mandayActivity;
}

int CalculateFreighterCreditHoursInMandayForEvaFdRule::CalculateCredit(const ROSTER* groundRoster, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam) {
	int credit = 0;
	if (ruleParam._creditExpression == "AGH") {
		//TODO groundRoster 暂时不用实现
	}
	else if (ruleParam._creditExpression == "GND") {
		//TODO groundRoster 暂时不用实现
	}
	return credit;
}

int CalculateFreighterCreditHoursInMandayForEvaFdRule::CalculateCredit(const Segment* segment, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam) {
	int credit = 0;
	if (ruleParam._creditExpression == "BT") {
		int scheBTInSecs = static_cast<int>(segment->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(segment, offsetTZMinutes, "SCH") - segment->getStartTimeUtcSch());
		int actBTInSecs = static_cast<int>(segment->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(segment, offsetTZMinutes, "ACT") - segment->getStartTimeUtcAct());
		if (ruleParam._creditDelayBuffer == RuleParamConstant::IGNORED) {
			credit = scheBTInSecs + ruleParam._creditBtGapMinutes * 60;
		}
		else {
			string timeType = GetTimeType(segment, offsetTZMinutes, ruleParam);
			credit = (timeType == "ACT" ? actBTInSecs : scheBTInSecs) + ruleParam._creditBtGapMinutes * 60;
		}

		credit = (int)round((credit/60.0) * ruleParam._creditPercent * ruleParam._creditMultiple);
	}
	return credit;
}

map<time_t, std::tuple<double, double>> CalculateFreighterCreditHoursInMandayForEvaFdRule::CalculateCreditDay(vector<std::shared_ptr<MandayActivity>>& allSegmentMandayActivities, map<string, map<time_t, std::tuple<double, double>>>& allAssignmentMapCrewMandayDay, 
	const vector<const Activity*>& activities, const int offsetTZMinutes, const std::shared_ptr<CREW>& crew, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam) {
	map<time_t, std::tuple<double, double>> mapCrewMandayDay;//map<本地时间天,tuple<当天credit时长合计(实际时间),当天credit时长合计(计划时间)>>
	vector<std::shared_ptr<MandayActivity>> mandayActivities;
	if (ruleParam._creditExpression == "BT") {
		mandayActivities = GetCreditActivityByBLH(activities, offsetTZMinutes, ruleParam);
		allSegmentMandayActivities.insert(allSegmentMandayActivities.end(), mandayActivities.begin(), mandayActivities.end());
	}
	else if (ruleParam._creditExpression == "AGH") {
		mandayActivities = GetCreditActivityByAvgGuaranteeHour(activities, offsetTZMinutes, ruleParam);
	}
	else if (ruleParam._creditExpression == "GND") {
		mandayActivities = GetCreditActivityByGround(activities, offsetTZMinutes, ruleParam);
		for (auto& tmpMandayActivity : mandayActivities) {
			if (tmpMandayActivity->getSegmentId() != 0) {
				allSegmentMandayActivities.emplace_back(tmpMandayActivity);
			}
		}		
	}
	else if (TimeUtils::isHHmm(ruleParam._creditExpression.c_str())){
		//针对ruleParam._creditExpression为HH:MM
		mandayActivities = GetCreditActivityByFixedDuration(activities, offsetTZMinutes, ruleParam);
		allSegmentMandayActivities.insert(allSegmentMandayActivities.end(), mandayActivities.begin(), mandayActivities.end());
	}

	auto actMapCrewMandayDay = MandayActivity::getCrewMandayGroupByDay(mandayActivities, this->_dbData, offsetTZMinutes, "ACT");
	auto schMapCrewMandayDay = MandayActivity::getCrewMandayGroupByDay(mandayActivities, this->_dbData, offsetTZMinutes, "SCH");

	if (actMapCrewMandayDay.empty() || schMapCrewMandayDay.empty()) {
		//数据异常保护
		return map<time_t, std::tuple<double, double>>();
	}

	CalculateCreditDayByExpression(actMapCrewMandayDay, crew, ruleParam);
	CalculateCreditDayByExpression(schMapCrewMandayDay, crew, ruleParam);

	//将实际时间计算结果(actMapCrewMandayDay)和计划时间计算结果(schMapCrewMandayDay)合并到 mapCrewMandayDay
	MergeCrewMandayDay(mapCrewMandayDay, actMapCrewMandayDay, schMapCrewMandayDay);

	//按Assignment分组后，单独计算pairing
	auto assignmentMapMandayActivities = GetMandayActivitiesByAssignment(mandayActivities);
	for (auto& pair : assignmentMapMandayActivities) {
		auto& assignment = pair.first;
		auto& tmpMandayActivities = pair.second;

		auto tmpActMapCrewMandayDay = MandayActivity::getCrewMandayGroupByDay(mandayActivities, this->_dbData, offsetTZMinutes, "ACT");
		CalculateCreditDayByExpression(tmpActMapCrewMandayDay, crew, ruleParam);

		auto tmpSchMapCrewMandayDay = MandayActivity::getCrewMandayGroupByDay(mandayActivities, this->_dbData, offsetTZMinutes, "SCH");
		CalculateCreditDayByExpression(tmpSchMapCrewMandayDay, crew, ruleParam);
		
		map<time_t, std::tuple<double, double>> mapAssignmentMandayDay;//map<本地时间天,tuple<当天credit时长合计(实际时间),当天credit时长合计(计划时间)>>
		//将实际时间计算结果(tmpActMapCrewMandayDay)和计划时间计算结果(tmpSchMapCrewMandayDay)合并到 mapAssignmentMandayDay
		MergeCrewMandayDay(mapAssignmentMandayDay, tmpActMapCrewMandayDay, tmpSchMapCrewMandayDay);
		//合并到allAssignmentMapCrewMandayDay中
		Merge(allAssignmentMapCrewMandayDay, assignment, mapAssignmentMandayDay);
	}

	return mapCrewMandayDay;
}

void CalculateFreighterCreditHoursInMandayForEvaFdRule::CalculateCreditDayByExpression(map<time_t, double>& mapCrewMandayDay, const std::shared_ptr<CREW>& crew, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam) const {
	if (ruleParam._creditExpression == "BT") {
		for (auto& pair : mapCrewMandayDay) {
			pair.second = pair.second / 60.0; //单位：分钟
		}

	}
	else if (ruleParam._creditExpression == "AGH") {
		for (auto& pair : mapCrewMandayDay) {
			int guaranteeHourInMinutes = crew->getGuaranteeHour(pair.first);
			if (guaranteeHourInMinutes > 0) {
				//avgGuaranteeHourInMinutes 为 机组人员的guarantee hours 年度每日平均值（单位：分钟）
				double avgGuaranteeHourInMinutes = (guaranteeHourInMinutes * 12 * 1.0) / 365;//guarantee hour(minutes) × 12 months / 365 days
				pair.second = ((avgGuaranteeHourInMinutes + ruleParam._creditBtGapMinutes) * ruleParam._creditPercent * ruleParam._creditMultiple); //单位：分钟
			}
			else {
				//未找到Guarantee Hour Avg则清空值
				pair.second = 0;
			}
		}
	}
	else if (ruleParam._creditExpression == "GND") {
		for (auto& pair : mapCrewMandayDay) {
			double workTime = pair.second; //单位：秒
			if (workTime <= 4 * 60 * 60) {
				//当天累计小于等于4小时，则为2小时
				workTime = 2 * 60;
			}
			else {
				//当天累计大于4小时，则为4小时
				workTime = 4 * 60;
			}
			//pair.second = (int)round((workTime + ruleParam._creditBtGapMinutes) * ruleParam._creditPercent * ruleParam._creditMultiple);//单位：分钟
			pair.second = (workTime + ruleParam._creditBtGapMinutes) * ruleParam._creditPercent * ruleParam._creditMultiple;//单位：分钟
		}
	}
	else if (TimeUtils::isHHmm(ruleParam._creditExpression.c_str())) {
		for (auto& pair : mapCrewMandayDay) {
			pair.second = pair.second / 60.0; //单位：分钟
		}
	}
}

void CalculateFreighterCreditHoursInMandayForEvaFdRule::Merge(map<string, map<time_t, std::tuple<double, double>>>& allAssignmentMapCrewMandayDay, const string& assignment, const map<time_t, std::tuple<double, double>>& mapAssignmentMandayDay) const {
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

map<string, vector<std::shared_ptr<MandayActivity>>> CalculateFreighterCreditHoursInMandayForEvaFdRule::GetMandayActivitiesByAssignment(const vector<std::shared_ptr<MandayActivity>>& mandayActivities) const {
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

string CalculateFreighterCreditHoursInMandayForEvaFdRule::GetTimeType(const Activity* activity, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam) const {
	if (ruleParam._creditDelayBuffer == RuleParamConstant::IGNORED) {
		return string("SCH");
	}
	int scheBTInSecs = static_cast<int>(activity->getEndTimeUtcSch() + RosterUtils::GetEndTimeGapInSec(activity, offsetTZMinutes, "SCH") - activity->getStartTimeUtcSch());
	int actBTInSecs = static_cast<int>(activity->getEndTimeUtcAct() + RosterUtils::GetEndTimeGapInSec(activity, offsetTZMinutes, "ACT") - activity->getStartTimeUtcAct());
	return ((actBTInSecs - scheBTInSecs) >= ruleParam._creditDelayBufferMinutes * 60) ? string("ACT") : string("SCH");
}

void CalculateFreighterCreditHoursInMandayForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(FreighterCreditHoursDefinitionForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(FreighterCreditHoursDefinitionForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}