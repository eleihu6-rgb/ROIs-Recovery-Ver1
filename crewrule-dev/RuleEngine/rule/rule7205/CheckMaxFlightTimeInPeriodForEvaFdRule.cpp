/**
 * @file MaxFlightTimeInPeriodForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMaxFlightTimeInPeriodForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/PhaseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../period/SegmentPeriod.h"
#include "../period/SlideWindow.h"
#include "../period/BaseActivityPeriod.h"
#include "TimezoneUtils.h"

inline static string& GetDomIntTypeInPeriod(string& domIntTypeInPeriod, const Duty* duty) {
	string domIntType = duty->getDomIntType();
	if (domIntTypeInPeriod.empty()) {
		domIntTypeInPeriod = domIntType;
	}
	else if (domIntType == "R" && domIntTypeInPeriod == "D") {
		domIntTypeInPeriod = "R";
	}
	else if (domIntType == "I" && domIntTypeInPeriod != "I") {
		domIntTypeInPeriod = "I";
	}
	return domIntTypeInPeriod;
}

inline static int GetFDPDiscretionInMinsWithTruncation(const Duty* duty, time_t windowStartUtc, time_t windowEndUtc, const std::shared_ptr<CrewDataContext>& dbData) {
	int fdpDiscretion = 0;
	if (duty->getManualFdpDiscretion() > 0) {
		fdpDiscretion = duty->getManualFdpDiscretion();
	}
	return fdpDiscretion;
}

inline static int GetDPDiscretionInMinsWithTruncation(const Duty* duty, time_t windowStartUtc, time_t windowEndUtc, const std::shared_ptr<CrewDataContext>& dbData) {
	int dpDiscretion = 0;
	if (duty->getManualDpDiscretion() > 0) {
		dpDiscretion = duty->getManualDpDiscretion();
	}
	return dpDiscretion;
}

inline static int GetBLHDiscretionInMinsWithTruncation(const Duty* duty, time_t windowStartUtc, time_t windowEndUtc, const std::shared_ptr<CrewDataContext>& dbData) {
	int blhDiscretion = 0;
	if (duty->getManualFtDiscretion() > 0) {
		blhDiscretion = duty->getManualFtDiscretion();
	}
	return blhDiscretion;
}

inline static set<string> GetFlightServiceTypesWithTruncation(const Duty* duty, time_t windowStartUtc, time_t windowEndUtc, const std::shared_ptr<CrewDataContext>& dbData) {
	set<string> flightServiceTypes;
	for (const auto segment : duty->getSegmentsRead()) {
		if (segment == nullptr || !segment->isOverlapWithUtcAct(windowStartUtc, windowEndUtc)) {
			continue;
		}
		string serviceType = segment->getFltType();
		flightServiceTypes.insert(serviceType);
	}
	return flightServiceTypes;
}

bool CheckMaxFlightTimeInPeriodForEvaFdRule::CheckRule(const Pairing* pairing) const {
	if (_ruleParams.empty()) {
		return true;
	}

	time_t checkedStartTime = pairing->getStartTimeUtcAct();
	time_t checkedEndTime = pairing->getEndTimeUtcAct();

	int offsetTZMinutes = GetTimeZoneOffset(checkedStartTime, pairing->getBase());
	_ruleViolation.SetParam("offsetTZMinute", StringUtils::itos(offsetTZMinutes));
	unordered_map<long long, const ROSTER*> pairingRosterMap;
	return CheckRule(pairing->getDutyVec(), offsetTZMinutes, pairingRosterMap);
}

bool CheckMaxFlightTimeInPeriodForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	if (rosters.empty()) {
		return true;
	}
	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}
	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	int offsetTZMinutes = GetTimeZoneOffset(checkedStartTime, crew->getPrimeBase());
	_ruleViolation.SetParam("offsetTZMinute", StringUtils::itos(offsetTZMinutes));

	unordered_map<long long, const ROSTER*> pairingRosterMap = RosterUtils::GetPairingRosterMap(rosters);
	auto activityPeriods = BaseActivityPeriod::GetActivityPeriodsOfDuty(rosters);
	return CheckRule(activityPeriods, offsetTZMinutes, pairingRosterMap);
}

bool CheckMaxFlightTimeInPeriodForEvaFdRule::CheckRule(const vector<Duty*>& duties, const int offsetTZMinutes, const unordered_map<long long, const ROSTER*>& pairingRosterMap) const {
	if (duties.empty()) {
		return true;
	}
	bool passAllRule = true;

	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

		CheckSelection currentSelection;
        currentSelection.checkBLH = !ruleParam._limitBLHRange.empty() && ruleParam._limitBLHRange != "*";
        currentSelection.checkFDP = !ruleParam._limitFDPRange.empty() && ruleParam._limitFDPRange != "*";
        currentSelection.checkDP = !ruleParam._limitDPRange.empty() && ruleParam._limitDPRange != "*";

		if (ruleParam._timePeriodUnit != "AH") {
			time_t firstDutyStartLoc = duties.front()->getStartTimeLocAct();
			time_t lastDutyEndLoc = duties.back()->getEndTimeLocAct();

			unsigned int slideStepSeconds = SlideWindow::GetWindowSlideSize(ruleParam._timePeriodUnit);
			time_t windowSizeSeconds = static_cast<time_t>(ruleParam._timePeriod * slideStepSeconds);

			time_t pairingStartUnitIdx = firstDutyStartLoc / slideStepSeconds;
			time_t pairingEndUnitIdx = lastDutyEndLoc / slideStepSeconds;
			time_t pairingSlideEndUnitIdx = pairingEndUnitIdx - ruleParam._timePeriod + 1;
			if (pairingSlideEndUnitIdx < pairingStartUnitIdx) {
				pairingSlideEndUnitIdx = pairingStartUnitIdx;
			}

			for (time_t slideIdx = pairingStartUnitIdx; slideIdx <= pairingSlideEndUnitIdx; ++slideIdx) {
				time_t windowStartLoc = slideIdx * slideStepSeconds;
				time_t windowEndLoc = windowStartLoc + windowSizeSeconds;

				// first duty that we need to count
				int firstOverlappedDutyIndex = -1;
				for (std::size_t i = 0; i < duties.size(); i++) {
					Duty* duty = duties[i];
					if (duty->isOverlapWithLocAct(windowStartLoc, windowEndLoc, offsetTZMinutes)) {

						if (!PhaseUtils::IsChecked(duty, ruleParam.GetPhase(), this->_dbData)) {
							continue;
						}

						if (!ruleParam.MatchDutyRule(*duty)) {
							continue;
						}

						firstOverlappedDutyIndex = (int)i;
						break;
					}
				}
				if (firstOverlappedDutyIndex == -1) {
					continue; // to next sliding window
				}
				bool valid = CheckDutyAfter(CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType::BASETIME_GIVEN, false, firstOverlappedDutyIndex, 0, duties, offsetTZMinutes, pairingRosterMap, ruleParam, currentSelection, windowStartLoc);
				if (!valid) {
					passAllRule = false;
					if (!this->IsCheckAllRule()) {
						break;
					}
				}
			}
		}
		else { // AH情况
			for (std::size_t i = 0; i < duties.size(); i++) {
				Duty* currDuty = duties[i];

				if (!PhaseUtils::IsChecked(currDuty, ruleParam.GetPhase(), this->_dbData)) {
					continue;
				}

				//每个Duty开始往后24小时 + 结束往前24小时。
				bool valid = CheckDutyAfter(CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType::DUTY_FDP_START, false, i, 0, duties, offsetTZMinutes, pairingRosterMap, ruleParam, currentSelection);
				if (!valid) {
					passAllRule = false;
					if (!this->IsCheckAllRule()) {
						break;
					}
				}

				valid = CheckDutyBefore(CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType::DUTY_FDP_END, true, i, 0, duties, offsetTZMinutes, pairingRosterMap, ruleParam, currentSelection);
				if (!valid) {
					passAllRule = false;
					if (!this->IsCheckAllRule()) {
						break;
					}
				}

				for (std::size_t j = 0; j < currDuty->getNumSegments(); j++) {

					Segment* currSegment = currDuty->getSegment(j);
					if (!currSegment->getIsOperating()) {
						continue;
					}

					//每个飞行航段起飞往后24小时 + 落地往前24小时。
					bool valid = CheckDutyAfter(CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType::SEGMENT_START, false, i, j, duties, offsetTZMinutes, pairingRosterMap, ruleParam, currentSelection);
					if (!valid) {
						passAllRule = false;
						if (!this->IsCheckAllRule()) {
							break;
						}
					}

					valid = CheckDutyBefore(CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType::SEGMENT_END, true, i, j, duties, offsetTZMinutes, pairingRosterMap, ruleParam, currentSelection);
					if (!valid) {
						passAllRule = false;
						if (!this->IsCheckAllRule()) {
							break;
						}
					}
				}
			}
		}
		// 若已经不满足规则，且不检查所有param，则跳出
		if (!passAllRule && !this->IsCheckAllRule()) {
			break;
		}
	}
	return passAllRule;
}

bool CheckMaxFlightTimeInPeriodForEvaFdRule::CheckRule(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const int offsetTZMinutes, const unordered_map<long long, const ROSTER*>& pairingRosterMap) const {
	if (activityPeriods.empty()) {
		return true;
	}
	bool passAllRule = true;

	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

		CheckSelection currentSelection;
		currentSelection.checkBLH = !ruleParam._limitBLHRange.empty() && ruleParam._limitBLHRange != "*";
		currentSelection.checkFDP = !ruleParam._limitFDPRange.empty() && ruleParam._limitFDPRange != "*";
		currentSelection.checkDP = !ruleParam._limitDPRange.empty() && ruleParam._limitDPRange != "*";

		if (ruleParam._timePeriodUnit != "AH") {
			time_t firstDutyStartLoc = activityPeriods.front()->GetStartTimeLoc();
			time_t lastDutyEndLoc = activityPeriods.back()->GetEndTimeLoc();

			unsigned int slideStepSeconds = SlideWindow::GetWindowSlideSize(ruleParam._timePeriodUnit);
			time_t windowSizeSeconds = static_cast<time_t>(ruleParam._timePeriod * slideStepSeconds);

			time_t pairingStartUnitIdx = firstDutyStartLoc / slideStepSeconds;
			time_t pairingEndUnitIdx = lastDutyEndLoc / slideStepSeconds;
			time_t pairingSlideEndUnitIdx = pairingEndUnitIdx - ruleParam._timePeriod + 1;
			if (pairingSlideEndUnitIdx < pairingStartUnitIdx) {
				pairingSlideEndUnitIdx = pairingStartUnitIdx;
			}

			for (time_t slideIdx = pairingStartUnitIdx; slideIdx <= pairingSlideEndUnitIdx; ++slideIdx) {
				time_t windowStartLoc = slideIdx * slideStepSeconds;
				time_t windowEndLoc = windowStartLoc + windowSizeSeconds;

				// first duty that we need to count
				int firstOverlappedDutyIndex = -1;
				for (std::size_t i = 0; i < activityPeriods.size(); i++) {
					auto& activityPeriod = activityPeriods[i];

					if (IgnoreActivityPeriod(activityPeriod, currentSelection)) {
						continue;
					}

					if (activityPeriod->isOverlapWithLoc(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
						if (!ruleParam.MatchActivityPeriodRule(activityPeriod)) {
							continue;
						}
						firstOverlappedDutyIndex = (int)i;
						break;
					}
				}
				if (firstOverlappedDutyIndex == -1) {
					continue; // to next sliding window
				}
				bool valid = CheckDutyAfter(CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType::BASETIME_GIVEN, false, firstOverlappedDutyIndex, 0, activityPeriods, offsetTZMinutes, pairingRosterMap, ruleParam, currentSelection, windowStartLoc);
				if (!valid) {
					passAllRule = false;
					if (!this->IsCheckAllRule()) {
						break;
					}
				}
			}
		}
		else { // AH情况
			for (std::size_t i = 0; i < activityPeriods.size(); i++) {
				auto& currActivityPeriod = activityPeriods[i];

				if (IgnoreActivityPeriod(currActivityPeriod, currentSelection)) {
					continue;
				}

				//每个Duty开始往后24小时 + 结束往前24小时。
				bool valid = CheckDutyAfter(CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType::DUTY_FDP_START, false, i, 0, activityPeriods, offsetTZMinutes, pairingRosterMap, ruleParam, currentSelection);
				if (!valid) {
					passAllRule = false;
					if (!this->IsCheckAllRule()) {
						break;
					}
				}

				valid = CheckDutyBefore(CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType::DUTY_FDP_END, true, i, 0, activityPeriods, offsetTZMinutes, pairingRosterMap, ruleParam, currentSelection);
				if (!valid) {
					passAllRule = false;
					if (!this->IsCheckAllRule()) {
						break;
					}
				}
				
				if (typeid(*currActivityPeriod->GetActivity()) == typeid(Duty)) {
					Duty* currDuty = (Duty*)currActivityPeriod->GetActivity();
					for (std::size_t j = 0; j < currDuty->getNumSegments(); j++) {

						Segment* currSegment = currDuty->getSegment(j);
						if (!currSegment->getIsOperating()) {
							continue;
						}

						//每个飞行航段起飞往后24小时 + 落地往前24小时。
						bool valid = CheckDutyAfter(CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType::SEGMENT_START, false, i, j, activityPeriods, offsetTZMinutes, pairingRosterMap, ruleParam, currentSelection);
						if (!valid) {
							passAllRule = false;
							if (!this->IsCheckAllRule()) {
								break;
							}
						}

						valid = CheckDutyBefore(CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType::SEGMENT_END, true, i, j, activityPeriods, offsetTZMinutes, pairingRosterMap, ruleParam, currentSelection);
						if (!valid) {
							passAllRule = false;
							if (!this->IsCheckAllRule()) {
								break;
							}
						}
					}
				}
			}
		}
		// 若已经不满足规则，且不检查所有param，则跳出
		if (!passAllRule && !this->IsCheckAllRule()) {
			break;
		}
	}
	return passAllRule;
}

bool CheckMaxFlightTimeInPeriodForEvaFdRule::CheckDutyBefore(const CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType baseTimeType, const bool isCeil, const std::size_t currDutyIndex, const std::size_t currDutySegmentIndex, const vector<Duty*>& allDuties, const int offsetTZMinutes, const unordered_map<long long, const ROSTER*>& pairingRosterMap, const MaxFlightTimeInPeriodForEvaFdRuleParam& ruleParam, const CheckSelection& selection /*= CheckSelection()*/) const {

	Duty* currDuty = allDuties[currDutyIndex];
	Segment* currSegment = currDuty->getSegment(currDutySegmentIndex);

	time_t windowEndLoc = GetBaseTime(baseTimeType, currDuty, currSegment) + (time_t)offsetTZMinutes * 60;
	if (ruleParam._timePeriodUnit != "AH") {
		windowEndLoc = isCeil ? TimeUtils::Ceil(windowEndLoc, TimeUtils::FromSlideUnit(ruleParam._timePeriodUnit)) :
			TimeUtils::Floor(windowEndLoc, TimeUtils::FromSlideUnit(ruleParam._timePeriodUnit));
	}

	//获得滑动窗口步长（单位秒），(按小时或按天滑动 转成秒)
	unsigned int windowSlideSize = SlideWindow::GetWindowSlideSize(ruleParam._timePeriodUnit);
	time_t windowStartLoc = windowEndLoc - static_cast<time_t>(ruleParam._timePeriod * windowSlideSize);


	time_t windowStartUtc = windowStartLoc - (time_t)offsetTZMinutes * 60;
	time_t windowEndUtc = windowEndLoc - (time_t)offsetTZMinutes * 60;

	MaxFlightTimeInPeriodForEvaFdRuleParam::CumulativeDuration cumulativeDuration;

	string domIntTypeInPeriod; //周期内部航班的国内和国际类型，若存在一个国际航班，则整体为国际航班
	for (int i = (int)currDutyIndex; i >= 0; i--) {
		Duty* prevDuty = allDuties[i];

		if (prevDuty->getEndTimeLocAct() < windowStartLoc) {
			break;
		}

		if (!PhaseUtils::IsChecked(prevDuty, ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		if (!ruleParam.MatchDutyRule(*prevDuty)) {
			continue;
		}

		GetDomIntTypeInPeriod(domIntTypeInPeriod, prevDuty);

		ROSTER* roster = nullptr;
		auto iterRoster = pairingRosterMap.find(prevDuty->getPairingId());
		if (iterRoster != pairingRosterMap.end()) {
			roster = const_cast<ROSTER*>(iterRoster->second);
		}

		if (prevDuty->isOverlapWithLocAct(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
			if (RosterUtils::ExistExceptionCode(roster, prevDuty, ruleParam.GetExceptionCodes(), this->_dbData)) {
				//忽略该Duty
			}
			else {
				if (selection.checkFDP) {
					int fdp = DutyUtils::GetDutyFDPInMinsWithTruncation(prevDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeFDPMinutes += fdp;
					int fdpDiscretion = GetFDPDiscretionInMinsWithTruncation(prevDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeFDPDiscretion = std::max(cumulativeDuration.cumulativeFDPDiscretion, fdpDiscretion);
				}
			}
		}
		if (prevDuty->isOverlapWithLocAct(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
			if (RosterUtils::ExistExceptionCode(roster, prevDuty, ruleParam.GetExceptionCodes(), this->_dbData)) {
				//忽略该Duty
			}
			else {
				if (selection.checkDP) {
					int dp = DutyUtils::GetDutyDPInMinsWithTruncation(prevDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeDPMinutes += dp;
					int dpDiscretion = GetDPDiscretionInMinsWithTruncation(prevDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeDPDiscretion = std::max(cumulativeDuration.cumulativeDPDiscretion, dpDiscretion);
				}
			}
		}

		vector<Segment*> segments = prevDuty->getSegments();
		for (vector<Segment*>::reverse_iterator segIter = segments.rbegin(); segIter != segments.rend(); ++segIter) {
			if (RosterUtils::ExistExceptionCode(roster, *segIter, ruleParam.GetExceptionCodes(), this->_dbData)) {
				//忽略该Segment
				continue;
			}

			if ((*segIter)->isOverlapWithLocAct(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
				if (selection.checkBLH) {
					int blh = SegmentUtils::GetBlkMinutesWithTruncation(*(*segIter), windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeBLHMinutes += blh;
					int blhDiscretion = GetBLHDiscretionInMinsWithTruncation(prevDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeBLHDiscretion = std::max(cumulativeDuration.cumulativeBLHDiscretion, blhDiscretion);
				}
			}
		}

		auto flightServiceTypes = GetFlightServiceTypesWithTruncation(prevDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
		cumulativeDuration.flightServiceTypes.insert(flightServiceTypes.begin(), flightServiceTypes.end());
	}
	if (!ruleParam.MatchDutyTypes(domIntTypeInPeriod)) {
		return true;
	}
	return CheckRule(cumulativeDuration, currDuty, windowStartLoc, windowEndLoc, ruleParam);
}

bool CheckMaxFlightTimeInPeriodForEvaFdRule::CheckDutyBefore(const CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType baseTimeType, const bool isCeil, const std::size_t currIndex, const std::size_t currDutySegmentIndex, const vector<shared_ptr<BaseActivityPeriod>>& allActivityPeriods, const int offsetTZMinutes, const unordered_map<long long, const ROSTER*>& pairingRosterMap, const MaxFlightTimeInPeriodForEvaFdRuleParam& ruleParam, const CheckSelection& selection) const {
	auto& currActivityPeriod = allActivityPeriods[currIndex];
	time_t windowEndLoc = 0;
	if (currActivityPeriod->GetRoster() != nullptr && currActivityPeriod->GetRoster()->pairing == nullptr) {
		windowEndLoc = GetBaseTime(baseTimeType, currActivityPeriod->GetRoster()) + (time_t)offsetTZMinutes * 60;
	}
	else {
		Duty* currDuty = (Duty*)currActivityPeriod->GetActivity();
		Segment* currSegment = currDuty->getSegment(currDutySegmentIndex);
		windowEndLoc = GetBaseTime(baseTimeType, currDuty, currSegment) + (time_t)offsetTZMinutes * 60;
	}

	if (ruleParam._timePeriodUnit != "AH") {
		windowEndLoc = isCeil ? TimeUtils::Ceil(windowEndLoc, TimeUtils::FromSlideUnit(ruleParam._timePeriodUnit)) :
			TimeUtils::Floor(windowEndLoc, TimeUtils::FromSlideUnit(ruleParam._timePeriodUnit));
	}

	//获得滑动窗口步长（单位秒），(按小时或按天滑动 转成秒)
	unsigned int windowSlideSize = SlideWindow::GetWindowSlideSize(ruleParam._timePeriodUnit);
	time_t windowStartLoc = windowEndLoc - static_cast<time_t>(ruleParam._timePeriod * windowSlideSize);


	time_t windowStartUtc = windowStartLoc - (time_t)offsetTZMinutes * 60;
	time_t windowEndUtc = windowEndLoc - (time_t)offsetTZMinutes * 60;

	MaxFlightTimeInPeriodForEvaFdRuleParam::CumulativeDuration cumulativeDuration;
	string domIntTypeInPeriod; //周期内部航班的国内和国际类型，若存在一个国际航班，则整体为国际航班
	for (int i = (int)currIndex; i >= 0; i--) {
		auto& prevActivityPeriod = allActivityPeriods[i];

		if (prevActivityPeriod->GetRoster() != nullptr && prevActivityPeriod->GetRoster()->pairing == nullptr) {
			if (prevActivityPeriod->isOverlapWithLoc(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
				if (selection.checkDP) {
					int dp = RosterUtils::GetDPInMinsWithTruncation(prevActivityPeriod->GetRoster(), windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeDPMinutes += dp;
				}
			}
		}
		else
		{
			Duty* prevDuty = (Duty*)prevActivityPeriod->GetActivity();

			if (prevDuty->getEndTimeLocAct() < windowStartLoc) {
				break;
			}

			if (!PhaseUtils::IsChecked(prevDuty, ruleParam.GetPhase(), this->_dbData)) {
				continue;
			}

			if (!ruleParam.MatchDutyRule(*prevDuty)) {
				continue;
			}

			GetDomIntTypeInPeriod(domIntTypeInPeriod, prevDuty);

			ROSTER* roster = nullptr;
			auto iterRoster = pairingRosterMap.find(prevDuty->getPairingId());
			if (iterRoster != pairingRosterMap.end()) {
				roster = const_cast<ROSTER*>(iterRoster->second);
			}

			if (prevDuty->isOverlapWithLocAct(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
				if (RosterUtils::ExistExceptionCode(roster, prevDuty, ruleParam.GetExceptionCodes(), this->_dbData)) {
					//忽略该Duty
				}
				else {
					if (selection.checkFDP) {
						int fdp = DutyUtils::GetDutyFDPInMinsWithTruncation(prevDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
						cumulativeDuration.cumulativeFDPMinutes += fdp;
						int fdpDiscretion = GetFDPDiscretionInMinsWithTruncation(prevDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
						cumulativeDuration.cumulativeFDPDiscretion = std::max(cumulativeDuration.cumulativeFDPDiscretion, fdpDiscretion);
					}
				}
			}

			if (prevDuty->isOverlapWithLocAct(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
				if (RosterUtils::ExistExceptionCode(roster, prevDuty, ruleParam.GetExceptionCodes(), this->_dbData)) {
					//忽略该Duty
				}
				else {
					if (selection.checkDP) {
						int dp = DutyUtils::GetDutyDPInMinsWithTruncation(prevDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
						cumulativeDuration.cumulativeDPMinutes += dp;
						int dpDiscretion = GetDPDiscretionInMinsWithTruncation(prevDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
						cumulativeDuration.cumulativeDPDiscretion = std::max(cumulativeDuration.cumulativeDPDiscretion, dpDiscretion);
					}
				}
			}

			vector<Segment*> segments = prevDuty->getSegments();
			for (vector<Segment*>::reverse_iterator segIter = segments.rbegin(); segIter != segments.rend(); ++segIter) {
				if (RosterUtils::ExistExceptionCode(roster, *segIter, ruleParam.GetExceptionCodes(), this->_dbData)) {
					//忽略该Segment
					continue;
				}

				if ((*segIter)->isOverlapWithLocAct(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
					if (selection.checkBLH) {
						int blh = SegmentUtils::GetBlkMinutesWithTruncation(*(*segIter), windowStartUtc, windowEndUtc, this->GetDataContext());
						cumulativeDuration.cumulativeBLHMinutes += blh;
						int blhDiscretion = GetBLHDiscretionInMinsWithTruncation(prevDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
						cumulativeDuration.cumulativeBLHDiscretion = std::max(cumulativeDuration.cumulativeBLHDiscretion, blhDiscretion);
					}
				}
			}

			auto flightServiceTypes = GetFlightServiceTypesWithTruncation(prevDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
			cumulativeDuration.flightServiceTypes.insert(flightServiceTypes.begin(), flightServiceTypes.end());
		}
	}
	if (!ruleParam.MatchDutyTypes(domIntTypeInPeriod)) {
		return true;
	}
	return CheckRule(cumulativeDuration, currActivityPeriod->GetActivity(), windowStartLoc, windowEndLoc, ruleParam);
}

bool CheckMaxFlightTimeInPeriodForEvaFdRule::CheckDutyAfter(const CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType baseTimeType
	, const bool isCeil, const std::size_t currDutyIndex, const std::size_t currDutySegmentIndex, const vector<Duty*>& allDuties
	, const int offsetTZMinutes, const unordered_map<long long, const ROSTER*>& pairingRosterMap
	, const MaxFlightTimeInPeriodForEvaFdRuleParam& ruleParam, const CheckSelection& checkFlag /*= CheckSelection()*/
	, time_t windowStartLocIfGiven /* = -1*/) const {

	Duty* currDuty = allDuties[currDutyIndex];
	Segment* currSegment = currDuty->getSegment(currDutySegmentIndex);
	
	time_t windowStartLoc = windowStartLocIfGiven;

	if (windowStartLoc == -1) {
		windowStartLoc = GetBaseTime(baseTimeType, currDuty, currSegment) + (time_t)offsetTZMinutes * 60;
		if (ruleParam._timePeriodUnit != "AH") {
			windowStartLoc = isCeil ? TimeUtils::Ceil(windowStartLoc, TimeUtils::FromSlideUnit(ruleParam._timePeriodUnit)) :
				TimeUtils::Floor(windowStartLoc, TimeUtils::FromSlideUnit(ruleParam._timePeriodUnit));
		}
	}

	//获得滑动窗口步长（单位秒），(按小时或按天滑动 转成秒)
	unsigned int windowSlideSize = SlideWindow::GetWindowSlideSize(ruleParam._timePeriodUnit);
	time_t windowEndLoc = windowStartLoc + static_cast<time_t>(ruleParam._timePeriod * windowSlideSize);

	time_t windowStartUtc = windowStartLoc - (time_t)offsetTZMinutes * 60;
	time_t windowEndUtc = windowEndLoc - (time_t)offsetTZMinutes * 60;

	MaxFlightTimeInPeriodForEvaFdRuleParam::CumulativeDuration cumulativeDuration;
	string domIntTypeInPeriod; //周期内部航班的国内和国际类型，若存在一个国际航班，则整体为国际航班
	for (std::size_t i = currDutyIndex; i < allDuties.size(); i++) {
		Duty* nextDuty = allDuties[i];

		if (nextDuty->getStartTimeLocAct() > windowEndLoc) {
			break;
		}

		if (!PhaseUtils::IsChecked(nextDuty, ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		if (!ruleParam.MatchDutyRule(*nextDuty)) {
			continue;
		}

		GetDomIntTypeInPeriod(domIntTypeInPeriod, nextDuty);
		
		ROSTER* roster = nullptr;
		auto iterRoster = pairingRosterMap.find(nextDuty->getPairingId());
		if (iterRoster != pairingRosterMap.end()) {
			roster = const_cast<ROSTER*>(iterRoster->second);
		}

		if (nextDuty->isOverlapWithLocAct(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
			if (RosterUtils::ExistExceptionCode(roster, nextDuty, ruleParam.GetExceptionCodes(), this->_dbData)) {
				//忽略该Duty
			}
			else {
				if (checkFlag.checkFDP) {
					int fdp = DutyUtils::GetDutyFDPInMinsWithTruncation(nextDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeFDPMinutes += fdp;
					int fdpDiscretion = GetFDPDiscretionInMinsWithTruncation(nextDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeFDPDiscretion = std::max(cumulativeDuration.cumulativeFDPDiscretion, fdpDiscretion);
				}
			}
		}

		if (nextDuty->isOverlapWithLocAct(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
			if (RosterUtils::ExistExceptionCode(roster, nextDuty, ruleParam.GetExceptionCodes(), this->_dbData)) {
				//忽略该Duty
			}
			else {
				if (checkFlag.checkDP) {
					int dp = DutyUtils::GetDutyDPInMinsWithTruncation(nextDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeDPMinutes += dp;
					int dpDiscretion = GetDPDiscretionInMinsWithTruncation(nextDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeDPDiscretion = std::max(cumulativeDuration.cumulativeDPDiscretion, dpDiscretion);
				}
			}
		}

		vector<Segment*> segments = nextDuty->getSegments();
		for (vector<Segment*>::iterator segIter = segments.begin(); segIter != segments.end(); ++segIter) {
			if (RosterUtils::ExistExceptionCode(roster, *segIter, ruleParam.GetExceptionCodes(), this->_dbData)) {
				//忽略该Segment
				continue;
			}

			if ((*segIter)->isOverlapWithLocAct(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
				if (checkFlag.checkBLH) {
					int blh = SegmentUtils::GetBlkMinutesWithTruncation(*(*segIter), windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeBLHMinutes += blh;
					int blhDiscretion = GetBLHDiscretionInMinsWithTruncation(nextDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeBLHDiscretion = std::max(cumulativeDuration.cumulativeBLHDiscretion, blhDiscretion);
				}
			}
		}

		auto flightServiceTypes = GetFlightServiceTypesWithTruncation(nextDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
		cumulativeDuration.flightServiceTypes.insert(flightServiceTypes.begin(), flightServiceTypes.end());
	}
	if (!ruleParam.MatchDutyTypes(domIntTypeInPeriod)) {
		return true;
	}
	return CheckRule(cumulativeDuration, currDuty, windowStartLoc, windowEndLoc, ruleParam);
}

bool CheckMaxFlightTimeInPeriodForEvaFdRule::CheckDutyAfter(const CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType baseTimeType
	, const bool isCeil, const std::size_t currIndex, const std::size_t currDutySegmentIndex, const vector<shared_ptr<BaseActivityPeriod>>& allActivityPeriods
	, const int offsetTZMinutes, const unordered_map<long long, const ROSTER*>&pairingRosterMap
	, const MaxFlightTimeInPeriodForEvaFdRuleParam & ruleParam, const CheckSelection & checkFlag /*= CheckSelection()*/
	, time_t windowStartLocIfGiven /* = -1*/) const {

	auto& currActivityPeriod = allActivityPeriods[currIndex];

	time_t windowStartLoc = windowStartLocIfGiven;

	if (windowStartLoc == -1) {
		if (currActivityPeriod->GetRoster() != nullptr && currActivityPeriod->GetRoster()->pairing == nullptr) {
			windowStartLoc = GetBaseTime(baseTimeType, currActivityPeriod->GetRoster()) + (time_t)offsetTZMinutes * 60;
		}
		else {
			Duty* currDuty = (Duty*)currActivityPeriod->GetActivity();
			Segment* currSegment = currDuty->getSegment(currDutySegmentIndex);

			windowStartLoc = GetBaseTime(baseTimeType, currDuty, currSegment) + (time_t)offsetTZMinutes * 60;
		}

		if (ruleParam._timePeriodUnit != "AH") {
			windowStartLoc = isCeil ? TimeUtils::Ceil(windowStartLoc, TimeUtils::FromSlideUnit(ruleParam._timePeriodUnit)) :
				TimeUtils::Floor(windowStartLoc, TimeUtils::FromSlideUnit(ruleParam._timePeriodUnit));
		}
	}


	//获得滑动窗口步长（单位秒），(按小时或按天滑动 转成秒)
	unsigned int windowSlideSize = SlideWindow::GetWindowSlideSize(ruleParam._timePeriodUnit);
	time_t windowEndLoc = windowStartLoc + static_cast<time_t>(ruleParam._timePeriod * windowSlideSize);

	time_t windowStartUtc = windowStartLoc - (time_t)offsetTZMinutes * 60;
	time_t windowEndUtc = windowEndLoc - (time_t)offsetTZMinutes * 60;

	MaxFlightTimeInPeriodForEvaFdRuleParam::CumulativeDuration cumulativeDuration;
	string domIntTypeInPeriod; //周期内部航班的国内和国际类型，若存在一个国际航班，则整体为国际航班
	for (std::size_t i = currIndex; i < allActivityPeriods.size(); i++) {
		auto& nextActivityPeriod = allActivityPeriods[i];
		if (nextActivityPeriod->GetRoster() != nullptr && nextActivityPeriod->GetRoster()->pairing == nullptr) {
			if (nextActivityPeriod->isOverlapWithLoc(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
				if (checkFlag.checkDP) {
					int dp = RosterUtils::GetDPInMinsWithTruncation(nextActivityPeriod->GetRoster(), windowStartUtc, windowEndUtc, this->GetDataContext());
					cumulativeDuration.cumulativeDPMinutes += dp;
				}
			}
		}
		else
		{
			Duty* nextDuty = (Duty*)nextActivityPeriod->GetActivity();

			if (nextDuty->getStartTimeLocAct() > windowEndLoc) {
				break;
			}

			if (!PhaseUtils::IsChecked(nextDuty, ruleParam.GetPhase(), this->_dbData)) {
				continue;
			}

			if (!ruleParam.MatchDutyRule(*nextDuty)) {
				continue;
			}

			GetDomIntTypeInPeriod(domIntTypeInPeriod, nextDuty);

			ROSTER* roster = nullptr;
			auto iterRoster = pairingRosterMap.find(nextDuty->getPairingId());
			if (iterRoster != pairingRosterMap.end()) {
				roster = const_cast<ROSTER*>(iterRoster->second);
			}

			if (nextDuty->isOverlapWithLocAct(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
				if (RosterUtils::ExistExceptionCode(roster, nextDuty, ruleParam.GetExceptionCodes(), this->_dbData)) {
					//忽略该Duty
				}
				else {
					if (checkFlag.checkFDP) {
						int fdp = DutyUtils::GetDutyFDPInMinsWithTruncation(nextDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
						cumulativeDuration.cumulativeFDPMinutes += fdp;
						int fdpDiscretion = GetFDPDiscretionInMinsWithTruncation(nextDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
						cumulativeDuration.cumulativeFDPDiscretion = std::max(cumulativeDuration.cumulativeFDPDiscretion, fdpDiscretion);
					}
				}
			}

			if (nextDuty->isOverlapWithLocAct(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
				if (RosterUtils::ExistExceptionCode(roster, nextDuty, ruleParam.GetExceptionCodes(), this->_dbData)) {
					//忽略该Duty
				}
				else {
					if (checkFlag.checkDP) {
						int dp = DutyUtils::GetDutyDPInMinsWithTruncation(nextDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
						cumulativeDuration.cumulativeDPMinutes += dp;
						int dpDiscretion = GetDPDiscretionInMinsWithTruncation(nextDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
						cumulativeDuration.cumulativeDPDiscretion = std::max(cumulativeDuration.cumulativeDPDiscretion, dpDiscretion);
					}
				}
			}

			vector<Segment*> segments = nextDuty->getSegments();
			for (vector<Segment*>::iterator segIter = segments.begin(); segIter != segments.end(); ++segIter) {
				if (RosterUtils::ExistExceptionCode(roster, *segIter, ruleParam.GetExceptionCodes(), this->_dbData)) {
					//忽略该Segment
					continue;
				}

				if ((*segIter)->isOverlapWithLocAct(windowStartLoc, windowEndLoc, offsetTZMinutes)) {
					if (checkFlag.checkBLH) {
						int blh = SegmentUtils::GetBlkMinutesWithTruncation(*(*segIter), windowStartUtc, windowEndUtc, this->GetDataContext());
						cumulativeDuration.cumulativeBLHMinutes += blh;
						int blhDiscretion = GetBLHDiscretionInMinsWithTruncation(nextDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
						cumulativeDuration.cumulativeBLHDiscretion = std::max(cumulativeDuration.cumulativeBLHDiscretion, blhDiscretion);
					}
				}
			}

			auto flightServiceTypes = GetFlightServiceTypesWithTruncation(nextDuty, windowStartUtc, windowEndUtc, this->GetDataContext());
			cumulativeDuration.flightServiceTypes.insert(flightServiceTypes.begin(), flightServiceTypes.end());
		}
	}
	if (!ruleParam.MatchDutyTypes(domIntTypeInPeriod)) {
		return true;
	}
	return CheckRule(cumulativeDuration, currActivityPeriod->GetActivity(), windowStartLoc, windowEndLoc, ruleParam);
}

bool CheckMaxFlightTimeInPeriodForEvaFdRule::CheckRule(const MaxFlightTimeInPeriodForEvaFdRuleParam::CumulativeDuration& cumulativeDuration, const Activity* activity, const time_t windowStartLoc, const time_t windowEndLoc, const MaxFlightTimeInPeriodForEvaFdRuleParam& ruleParam) const {
	int warnCode = ruleParam.CheckParam(cumulativeDuration);
	if (warnCode != (int)MaxFlightTimeInPeriodForEvaFdRuleParam::WarnCode::NO_WARN) {
		_ruleViolation.SetParam("startTimeLoc", StringUtils::lltos((long long)windowStartLoc));
		_ruleViolation.SetParam("endTimeLoc", StringUtils::lltos((long long)windowEndLoc));
		_ruleViolation.SetParam("period", StringUtils::itos(ruleParam._timePeriod));
		_ruleViolation.SetParam("periodType", ruleParam._timePeriodUnit);
		_ruleViolation.SetParam("blhTotalMinutes", TimeUtils::MinutesTohhmm(cumulativeDuration.cumulativeBLHMinutes));
		_ruleViolation.SetParam("limitBLHRange", ruleParam._limitBLHRange);
		_ruleViolation.SetParam("fdpTotalMinutes", TimeUtils::MinutesTohhmm(cumulativeDuration.cumulativeFDPMinutes));
		_ruleViolation.SetParam("limitFDPRange", ruleParam._limitFDPRange);
		_ruleViolation.SetParam("dpTotalMinutes", TimeUtils::MinutesTohhmm(cumulativeDuration.cumulativeDPMinutes));
		_ruleViolation.SetParam("limitDPRange", ruleParam._limitDPRange);
	}
	bool valid = true;
	if ((warnCode & (int)MaxFlightTimeInPeriodForEvaFdRuleParam::WarnCode::BLH_WARN) == (int)MaxFlightTimeInPeriodForEvaFdRuleParam::WarnCode::BLH_WARN) {
		valid = false;
		ThrowRuleViolationForBLH(activity);
	}
	if ((warnCode & (int)MaxFlightTimeInPeriodForEvaFdRuleParam::WarnCode::FDP_WARN) == (int)MaxFlightTimeInPeriodForEvaFdRuleParam::WarnCode::FDP_WARN) {
		valid = false;
		ThrowRuleViolationForFDP(activity);
	}
	if ((warnCode & (int)MaxFlightTimeInPeriodForEvaFdRuleParam::WarnCode::DP_WARN) == (int)MaxFlightTimeInPeriodForEvaFdRuleParam::WarnCode::DP_WARN) {
		valid = false;
		ThrowRuleViolationForDP(activity);
	}
	return valid;
}

bool CheckMaxFlightTimeInPeriodForEvaFdRule::CheckRule(const long blhTotalMinutes, const time_t windowStartLoc, const time_t windowEndLoc, int offsetTZMinutes, const Period* period, const MaxFlightTimeInPeriodForEvaFdRuleParam& ruleParam) const {
	_ruleViolation.SetParam("startTimeLoc", StringUtils::lltos((long long)windowStartLoc));
	_ruleViolation.SetParam("endTimeLoc", StringUtils::lltos((long long)windowEndLoc));
	_ruleViolation.SetParam("period", StringUtils::itos(ruleParam._timePeriod));
	_ruleViolation.SetParam("periodType", ruleParam._timePeriodUnit);
	_ruleViolation.SetParam("blhTotalMinutes", TimeUtils::MinutesTohhmm(blhTotalMinutes));
	_ruleViolation.SetParam("limitBLHRange", ruleParam._limitBLHRange);

	SegmentPeriod* segmentPeriod = (SegmentPeriod*)period;
	if (blhTotalMinutes < ruleParam._limitBLHMinutesLower || blhTotalMinutes >= ruleParam._limitBLHMinutesUpper) {
		ThrowRuleViolationForBLH(segmentPeriod->GetDuty());
		return false;
	}
	return true;
}

int CheckMaxFlightTimeInPeriodForEvaFdRule::GetTimeZoneOffset(const time_t baseUtcTime, const std::string base) const {
	string station = base;
	string airlinecode = this->GetDataContext()->scenario.airline;
	if (airlinecode == "BR") {
		//针对长荣，需求要求固定为 TPE 机场时区时间
		station = "TPE";
	}
	string depZoneId = this->GetDataContext()->getAirportZoneId(station);
	int offset = TimezoneUtils::GetTimezoneOffset(baseUtcTime, depZoneId);
	return offset;
}

vector<CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType> CheckMaxFlightTimeInPeriodForEvaFdRule::GetAllBaseTimeTypes() const {
	vector<CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType> allBaseTimeTypes;
	allBaseTimeTypes.push_back(BaseTimeType::SEGMENT_START);
	allBaseTimeTypes.push_back(BaseTimeType::SEGMENT_END);
	allBaseTimeTypes.push_back(BaseTimeType::DUTY_FDP_START);
	allBaseTimeTypes.push_back(BaseTimeType::DUTY_FDP_END);
	allBaseTimeTypes.push_back(BaseTimeType::DUTY_DP_START);
	allBaseTimeTypes.push_back(BaseTimeType::DUTY_DP_END);
	allBaseTimeTypes.push_back(BaseTimeType::BASETIME_GIVEN);
	return allBaseTimeTypes;
}

time_t CheckMaxFlightTimeInPeriodForEvaFdRule::GetBaseTime(const CheckMaxFlightTimeInPeriodForEvaFdRule::BaseTimeType baseTimeType, const Duty* duty, const Segment* segment) const {
	time_t baseTime = segment->getEndTimeUtcAct();
	if (baseTimeType == BaseTimeType::SEGMENT_START) {
		baseTime = segment->getStartTimeUtcAct();
	}
	else if (baseTimeType == BaseTimeType::SEGMENT_END) {
		baseTime = segment->getEndTimeUtcAct();
	}
	else if (baseTimeType == BaseTimeType::DUTY_FDP_START) {
		//baseTime = duty->getFDPStartUtcTimes(); 获取时间可能不对
		baseTime = duty->getFirstSegment()->getStartTimeUtcAct();
		if (duty->getFirstFdpSegment() != nullptr) {
			baseTime = duty->getFirstFdpSegment()->getStartTimeUtcAct();
		}
		if (RuleParams::GetInstancePtr()->bPickupCount) {
			baseTime = duty->getFirstPickup()->getStartTimeUtcAct();
		}
		else if (RuleParams::GetInstancePtr()->bIncludeCI) {
			baseTime = duty->getFirstBreif()->getStartTimeUtcAct();
		}
	}
	else if (baseTimeType == BaseTimeType::DUTY_FDP_END) {
		//baseTime = duty->getFDPEndUtcTimes(); 获取时间可能不对
		baseTime = duty->getLastSegment()->getEndTimeUtcAct();
		if (duty->getLastFdpSegment() != nullptr) {
			baseTime = duty->getLastFdpSegment()->getEndTimeUtcAct();
		}
		if (RuleParams::GetInstancePtr()->bDropoffCount) {
			baseTime = duty->getLastDropoff()->getEndTimeUtcAct();
		}
		else if (RuleParams::GetInstancePtr()->bIncludeCO) {
			baseTime = duty->getLastDebrief()->getEndTimeUtcAct();
		}
	}
	else if (baseTimeType == BaseTimeType::DUTY_DP_START) {
		baseTime = duty->getStartTimeUtcAct();
	}
	else if (baseTimeType == BaseTimeType::DUTY_DP_END) {
		baseTime = duty->getEndTimeUtcAct();
	}
	return baseTime;
}

time_t CheckMaxFlightTimeInPeriodForEvaFdRule::GetBaseTime(const BaseTimeType baseTimeType, const ROSTER* groundRoster) const {
	time_t baseTime = groundRoster->getRestStartUtcAct();
	if (baseTimeType == BaseTimeType::DUTY_DP_START || baseTimeType == BaseTimeType::SEGMENT_START || baseTimeType == BaseTimeType::DUTY_FDP_START) {
		baseTime = groundRoster->getStartTimeUtcAct();
	}
	else if (baseTimeType == BaseTimeType::DUTY_DP_END || baseTimeType == BaseTimeType::SEGMENT_END || baseTimeType == BaseTimeType::DUTY_FDP_END) {
		baseTime = groundRoster->getRestStartUtcAct();
	}
	return baseTime;
}

bool CheckMaxFlightTimeInPeriodForEvaFdRule::IgnoreActivityPeriod(const shared_ptr<BaseActivityPeriod>& activityPeriod, const CheckSelection& checkSelection) const {
	if (checkSelection.checkDP && !checkSelection.checkBLH && !checkSelection.checkFDP) {
		return activityPeriod->GetRoster() != nullptr && (activityPeriod->GetRoster()->pairing == nullptr);
	}
	return false;
}

void CheckMaxFlightTimeInPeriodForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MaxFlightTimeInPeriodForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MaxFlightTimeInPeriodForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckMaxFlightTimeInPeriodForEvaFdRule::ThrowRuleViolationForBLH(const Activity* activity) const{
	time_t startLoc = StringUtils::stoi(_ruleViolation.GetParam("startTimeLoc"), 0);
	time_t endLoc = StringUtils::stoi(_ruleViolation.GetParam("endTimeLoc"), 0) - 1;
	int offsetTZMinute = StringUtils::stoi(_ruleViolation.GetParam("offsetTZMinute"), 0);
	time_t startUtc = startLoc - offsetTZMinute * 60;
	time_t endUtc = endLoc - offsetTZMinute * 60;
	
	string startLocStr = TimeUtils::Format(startLoc, "yyyy-mm-dd HH:mm");
	string endLocStr = TimeUtils::Format(endLoc, "yyyy-mm-dd HH:mm");

	string blhTotalMinutes = _ruleViolation.GetParam("blhTotalMinutes");
	string limitBLHRange = _ruleViolation.GetParam("limitBLHRange");
	string period = _ruleViolation.GetParam("period");
	string periodType = _ruleViolation.GetParam("periodType");

	std::string msg = "[{0:start} - {1:end}] Cumulative flight time({2:blhTotalMinutes}) exceeds the range of {3:limitBLHRange} in this {4:period} {5:periodType} window.";
	msg = StringUtils::Format(msg, startLocStr.c_str(), endLocStr.c_str(),
		blhTotalMinutes, limitBLHRange, period, periodType);

	RULE_VIOLATION* rv = new RULE_VIOLATION();

	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		if (typeid(*activity) == typeid(Duty)) {
			const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, ((Duty*)activity)->getPairingId());
			rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		}
		else if (typeid(*activity) == typeid(ROSTER)) {
			rv->rosterId = ((ROSTER*)activity)->rosterId;
		}
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}
	if (typeid(*activity) == typeid(Duty)) {
		rv->pairingId = ((Duty*)activity)->getPairingId();
		rv->dutySequenceNumber = ((Duty*)activity)->getDutySeq();
	}
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("startLocStr", startLocStr));
	rv->operation_result.insert(pair<string, string>("endLocStr", endLocStr));
	rv->operation_result.insert(pair<string, string>("blhTotalMinutes", blhTotalMinutes));
	rv->operation_result.insert(pair<string, string>("limitBLHRange", limitBLHRange));
	rv->operation_result.insert(pair<string, string>("period", period));
	rv->operation_result.insert(pair<string, string>("periodType", periodType));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckMaxFlightTimeInPeriodForEvaFdRule::ThrowRuleViolationForFDP(const Activity* activity) const {
	time_t startLoc = StringUtils::stoi(_ruleViolation.GetParam("startTimeLoc"), 0);
	time_t endLoc = StringUtils::stoi(_ruleViolation.GetParam("endTimeLoc"), 0) - 1;
	int offsetTZMinute = StringUtils::stoi(_ruleViolation.GetParam("offsetTZMinute"), 0);
	time_t startUtc = startLoc - offsetTZMinute * 60;
	time_t endUtc = endLoc - offsetTZMinute * 60;

	string startLocStr = TimeUtils::Format(startLoc, "yyyy-mm-dd HH:mm");
	string endLocStr = TimeUtils::Format(endLoc, "yyyy-mm-dd HH:mm");

	string fdpTotalMinutes = _ruleViolation.GetParam("fdpTotalMinutes");
	string limitFDPRange = _ruleViolation.GetParam("limitFDPRange");
	string period = _ruleViolation.GetParam("period");
	string periodType = _ruleViolation.GetParam("periodType");

	std::string msg = "[{0:start} - {1:end}] The cumulative flight duty period({2:fdpTotalMinutes}) exceeds the allowable range of { 3:limitFDPRange } for this {4:period} { 5:periodType } window.";
	msg = StringUtils::Format(msg, startLocStr.c_str(), endLocStr.c_str(),
		fdpTotalMinutes, limitFDPRange, period, periodType);

	RULE_VIOLATION* rv = new RULE_VIOLATION();

	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		if (typeid(*activity) == typeid(Duty)) {
			const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, ((Duty*)activity)->getPairingId());
			rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		}
		else if (typeid(*activity) == typeid(ROSTER)) {
			rv->rosterId = ((ROSTER*)activity)->rosterId;
		}
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	if (typeid(*activity) == typeid(Duty)) {
		rv->pairingId = ((Duty*)activity)->getPairingId();
		rv->dutySequenceNumber = ((Duty*)activity)->getDutySeq();
	}
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("startLocStr", startLocStr));
	rv->operation_result.insert(pair<string, string>("endLocStr", endLocStr));
	rv->operation_result.insert(pair<string, string>("fdpTotalMinutes", fdpTotalMinutes));
	rv->operation_result.insert(pair<string, string>("limitFDPRange", limitFDPRange));
	rv->operation_result.insert(pair<string, string>("period", period));
	rv->operation_result.insert(pair<string, string>("periodType", periodType));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckMaxFlightTimeInPeriodForEvaFdRule::ThrowRuleViolationForDP(const Activity* activity) const {
	time_t startLoc = StringUtils::stoi(_ruleViolation.GetParam("startTimeLoc"), 0);
	time_t endLoc = StringUtils::stoi(_ruleViolation.GetParam("endTimeLoc"), 0) - 1;
	int offsetTZMinute = StringUtils::stoi(_ruleViolation.GetParam("offsetTZMinute"), 0);
	time_t startUtc = startLoc - offsetTZMinute * 60;
	time_t endUtc = endLoc - offsetTZMinute * 60;

	string startLocStr = TimeUtils::Format(startLoc, "yyyy-mm-dd HH:mm");
	string endLocStr = TimeUtils::Format(endLoc, "yyyy-mm-dd HH:mm");

	string dpTotalMinutes = _ruleViolation.GetParam("dpTotalMinutes");
	string limitDPRange = _ruleViolation.GetParam("limitDPRange");
	string period = _ruleViolation.GetParam("period");
	string periodType = _ruleViolation.GetParam("periodType");

	std::string msg = "[{0:start} - {1:end}] The cumulative duty period({2:dpTotalMinutes}) exceeds the allowable range of { 3:limitDPRange } for this {4:period} { 5:periodType } window.";
	msg = StringUtils::Format(msg, startLocStr.c_str(), endLocStr.c_str(),
		dpTotalMinutes, limitDPRange, period, periodType);

	RULE_VIOLATION* rv = new RULE_VIOLATION();

	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		if (typeid(*activity) == typeid(Duty)) {
			const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, ((Duty*)activity)->getPairingId());
			rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		}
		else if (typeid(*activity) == typeid(ROSTER)) {
			rv->rosterId = ((ROSTER*)activity)->rosterId;
		}
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	if (typeid(*activity) == typeid(Duty)) {
		rv->pairingId = ((Duty*)activity)->getPairingId();
		rv->dutySequenceNumber = ((Duty*)activity)->getDutySeq();
	}
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("startLocStr", startLocStr));
	rv->operation_result.insert(pair<string, string>("endLocStr", endLocStr));
	rv->operation_result.insert(pair<string, string>("dpTotalMinutes", dpTotalMinutes));
	rv->operation_result.insert(pair<string, string>("limitDPRange", limitDPRange));
	rv->operation_result.insert(pair<string, string>("period", period));
	rv->operation_result.insert(pair<string, string>("periodType", periodType));
	_ruleViolation.AddRuleViolations(rv);
}

bool MaxFlightTimeInPeriodSlideListener::OnSlide(bool& next, bool& ignoreSlide, const Period* period, const Period* nextPeriod, const time_t windowStartLoc, const time_t windowEndLoc, int offsetTZMinutes, void* param, ...) const {
	MaxFlightTimeInPeriodForEvaFdRuleParam* ruleParam = (MaxFlightTimeInPeriodForEvaFdRuleParam*)param;
	next = true;
	bool isValid = true;

	bool changed = !isSameWindow(windowStartLoc, windowEndLoc);
	bool isLast = (nextPeriod == nullptr); //最后一个
	if (_BLHTotalMinutes > 0 && (changed || isLast)) {
		//滚动窗户发生变化，或者是最后一个，则进行检查
		isValid = _rule->CheckRule(_BLHTotalMinutes, _currWindowStart, _currWindowEnd, offsetTZMinutes, period, *ruleParam);
	}

	//滚动窗户变化，则重新统计。
	if (changed) {
		_currWindowStart = windowStartLoc;
		_currWindowEnd = windowEndLoc;
		_BLHTotalMinutes = 0;
	}

	//累计飞时
	SegmentPeriod* segmentPeriod = (SegmentPeriod*)period;

	Duty* duty = segmentPeriod->GetDuty();
	Segment* segment = segmentPeriod->GetSegment();
	if (ruleParam->MatchDutyTypes(duty->getDomIntType()) && ruleParam->MatchDutyAssignments(*duty) 
			&& ruleParam->MatchComposition(*duty)) {
		_BLHTotalMinutes += SegmentUtils::GetBlkMinutes(*(segment));
	}

	return isValid;
}
