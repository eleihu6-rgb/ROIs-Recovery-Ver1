#include "CalculatePairingPerDiemHoursForEvaFdRule.h"
#include <cfloat>
#include <algorithm>
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/SchDutyUtils.h"
#include "../utils/RosterUtils.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

//二个Duty之间的Perdiem
inline static void setPerDiemBetweenDuty(PerDiem& perDiem, PerDiem& dutyPerDiem, const time_t firstMonthStartTimeUtc,  const Duty* prevDuty, const Duty* currDuty, const bool isLongPerDiemOfPrevDuty, const bool isLongPerDiemOfCurrDuty, const int offsetTZMinutes, const string& prevDutyTimeType, const string& timeType, const string& calcTimeType) {
	time_t startTimeInUtc = 0;
	time_t endTimeInUtc = 0;

	if (dutyPerDiem.getPerDiemInSec(calcTimeType) > 0) {
		//prevDuty和currDuty之间的DropOff(prevDuty)、Layover、Pickup(currDuty)时间，计入Per Diem
		if (prevDutyTimeType == "ACT") {
			startTimeInUtc = prevDuty->getEndTimeUtcAct();
		}
		else {
			startTimeInUtc = SchDutyUtils::GetDutySchEndTimeUtc(prevDuty, true);
		}

		if (timeType == "ACT") {

			endTimeInUtc = currDuty->getStartTimeUtcAct();
		}
		else {
			endTimeInUtc = SchDutyUtils::GetDutySchStartTimeUtc(currDuty, true);
		}
	}
	else {
		//Duty的Per Diem为0时，prevDuty和currDuty之间的DropOff(prevDuty)、Layover时间，计入Per Diem
		if (prevDutyTimeType == "ACT") {
			startTimeInUtc = prevDuty->getEndTimeUtcAct();
		}
		else {
			startTimeInUtc = SchDutyUtils::GetDutySchEndTimeUtc(prevDuty, true);
		}

		if (timeType == "ACT") {
			endTimeInUtc = currDuty->getStartTimeUtcAct() - (time_t)currDuty->getActualPickupMin() * 60;
		}
		else {
			endTimeInUtc = SchDutyUtils::GetDutySchStartTimeUtc(currDuty, true) - (time_t)currDuty->getMinPickup() * 60;
		}
	}
	int duration = static_cast<int>(endTimeInUtc - startTimeInUtc);//二个Duty之间需要计算per-diem的时长
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

	perDiem.setPerDiemInSec(perDiem.getPerDiemInSec(calcTimeType) + duration, calcTimeType);
	perDiem.setFirstMonthPerDiemInSec(perDiem.getFirstMonthPerDiemInSec(calcTimeType) + firstMonthDuration, calcTimeType);
	if (isLongPerDiemOfCurrDuty && isLongPerDiemOfPrevDuty) {
		//当前Duty和前一个Duty都满足 Long Perdiem，中间DropOff(prevDuty)、Layover、Pickup(currDuty)等才计入LPH
		perDiem.setLongPerDiemInSec(perDiem.getLongPerDiemInSec(calcTimeType) + duration, calcTimeType);
		perDiem.setFirstMonthLongPerDiemInSec(perDiem.getFirstMonthLongPerDiemInSec(calcTimeType) + firstMonthDuration, calcTimeType);
	}
}

PerDiem CalculatePairingPerDiemHoursForEvaFdRule::Calculate(Pairing* pairing) {
	PerDiem perDiem;
	if (_ruleParams.empty()) {
		return PerDiem();
	}
	auto& dbData = this->GetDataContext();

	int offsetTZMinutes = DutyUtils::GetTimeZoneOffsetByDep(*(pairing->getFirstDuty()), dbData);

	Duty* prevDuty = nullptr;//紧接前一个能匹配到Duty
	string prevDutyTimeType = "SCH";
	//rulePaam._perDiemGapMinutes针对整个Pairing的Gap，因此每个Pairing仅能计算一次
	map<long long, int> mapPerDiemGap;//记录法规规则对应PerDiemGap值<ruleParamId, perDiemGapMinutes>
	bool isLongPerDiemOfPrevDuty = false;//前一个Duty是否计入Long Perdiem
	time_t actFirstMonthStartTimeUtc = pairing->getFirstDuty()->getStartTimeUtcAct();	//第一个月开始时间(实际时间)
	time_t schFirstMonthStartTimeUtc = SchDutyUtils::GetDutySchStartTimeUtc(pairing->getFirstDuty(), true);	//第一个月开始时间(计划时间)
	for (const auto& currDuty : pairing->getDutyVec()) {
		bool matchedWithDuty = false;
		for (const auto& ruleParam : _ruleParams) {
			if (ruleParam.MatchParam(pairing, currDuty)) {
				matchedWithDuty = true;
				string timeType = GetTimeType(currDuty, offsetTZMinutes, ruleParam);
				auto dutyPerDiem = GetDutyPerDiemInSec(mapPerDiemGap, currDuty, offsetTZMinutes, actFirstMonthStartTimeUtc, schFirstMonthStartTimeUtc, timeType, ruleParam);
				perDiem.actPerDiemInSec += dutyPerDiem.actPerDiemInSec;
				perDiem.actFirstMonthPerDiemInSec += dutyPerDiem.actFirstMonthPerDiemInSec;

				perDiem.schPerDiemInSec += dutyPerDiem.schPerDiemInSec;
				perDiem.schFirstMonthPerDiemInSec += dutyPerDiem.schFirstMonthPerDiemInSec;

				//当前Duty是否计入Long Perdiem
				bool isLongPerDiemOfCurrDuty = DutyUtils::IsLongPerdiem(currDuty, dbData);

				if (isLongPerDiemOfCurrDuty) {
					perDiem.actLongPerDiemInSec += dutyPerDiem.actPerDiemInSec;
					perDiem.actFirstMonthLongPerDiemInSec += dutyPerDiem.actFirstMonthPerDiemInSec;

					perDiem.schLongPerDiemInSec += dutyPerDiem.schPerDiemInSec;
					perDiem.schFirstMonthLongPerDiemInSec += dutyPerDiem.schFirstMonthPerDiemInSec;
				}

				//紧接前一个Duty若匹配上，则计算prevDuty和currDuty之间的DropOff(prevDuty)、Layover、Pickup(currDuty)时间
				if (prevDuty != nullptr) {
					setPerDiemBetweenDuty(perDiem, dutyPerDiem, actFirstMonthStartTimeUtc, prevDuty, currDuty, isLongPerDiemOfPrevDuty, isLongPerDiemOfCurrDuty, offsetTZMinutes, prevDutyTimeType, timeType, "ACT");
					setPerDiemBetweenDuty(perDiem, dutyPerDiem, schFirstMonthStartTimeUtc, prevDuty, currDuty, isLongPerDiemOfPrevDuty, isLongPerDiemOfCurrDuty, offsetTZMinutes, "SCH", "SCH", "SCH");
				}
				prevDuty = currDuty;
				prevDutyTimeType = timeType;
				isLongPerDiemOfPrevDuty = isLongPerDiemOfCurrDuty;
				break;
			}
		}
		if (!matchedWithDuty) {
			//当前Duty计入Per Diem
			prevDuty = nullptr;
			prevDutyTimeType = "SCH";
			isLongPerDiemOfPrevDuty = false;
		}
	}
	for (auto& pair : mapPerDiemGap) {
		perDiem.actPerDiemInSec += pair.second * 60;
		perDiem.schPerDiemInSec += pair.second * 60;
	}
	return perDiem;
}

PerDiem CalculatePairingPerDiemHoursForEvaFdRule::GetDutyPerDiemInSec(std::map<long long, int>& mapPerDiemGap, const Duty* duty, const int offsetTZMinutes, const time_t actFirstMonthStartTimeUtc, const time_t schFirstMonthStartTimeUtc, const string& timeType, const PairingPerDiemHoursForEvaFdRuleParam& ruleParam) const {
	PerDiem perDiem;
	if (ruleParam._perDiemExpressionMinutes != nullptr) {
		perDiem.actPerDiemInSec = (*ruleParam._perDiemExpressionMinutes) * 60;
		perDiem.schPerDiemInSec = (*ruleParam._perDiemExpressionMinutes) * 60;
	}
	else if (ruleParam._perDiemExpression == "D-B") {
		time_t actStartTimeInUtc = (timeType == "ACT") ? duty->getStartTimeUtcAct() : SchDutyUtils::GetDutySchStartTimeUtc(duty, true);
		time_t actEndTimeInUtc = (timeType == "ACT") ? duty->getEndTimeUtcAct() : SchDutyUtils::GetDutySchEndTimeUtc(duty, true);
		time_t schStartTimeInUtc = SchDutyUtils::GetDutySchStartTimeUtc(duty, true);
		time_t schEndTimeInUtc = SchDutyUtils::GetDutySchEndTimeUtc(duty, true);

		perDiem.actPerDiemInSec = static_cast<int>(actEndTimeInUtc + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, timeType) - actStartTimeInUtc);
		perDiem.schPerDiemInSec = static_cast<int>(schEndTimeInUtc + RosterUtils::GetEndTimeGapInSec(duty->getLastSegment(), offsetTZMinutes, "SCH") - schStartTimeInUtc);

		//按月切分，计算切分到第一个月PH（实际时间）
		if (TimeUtils::IsSameMonth(actStartTimeInUtc, actFirstMonthStartTimeUtc, offsetTZMinutes) && TimeUtils::IsSameMonth(actStartTimeInUtc, actEndTimeInUtc, offsetTZMinutes)) {
			//场景1: startTimeUtc和endTimeUtc在首月firstMonth
			perDiem.actFirstMonthPerDiemInSec = static_cast<int>(actEndTimeInUtc - actStartTimeInUtc);
		}
		else if (TimeUtils::IsSameMonth(actStartTimeInUtc, actFirstMonthStartTimeUtc, offsetTZMinutes) && !TimeUtils::IsSameMonth(actStartTimeInUtc, actEndTimeInUtc, offsetTZMinutes)) {
			//场景2: startTimeUtc在首月firstMonth，endTimeUtc在第二个月

			//"开始时间"和"结束时间"不在一个月，获得“结束时间”所在月份的第一个天0点（即所在月份开始时间）
			time_t actMonthStartInUtc = Utility::GetInstancePtr()->getLocalMonthStartInUTC(actEndTimeInUtc, offsetTZMinutes);
			perDiem.actFirstMonthPerDiemInSec = static_cast<int>(actMonthStartInUtc - actStartTimeInUtc);
		}

		//按月切分，计算切分到第一个月PH（计划时间）
		if (TimeUtils::IsSameMonth(schStartTimeInUtc, schFirstMonthStartTimeUtc, offsetTZMinutes) && TimeUtils::IsSameMonth(schStartTimeInUtc, schEndTimeInUtc, offsetTZMinutes)) {
			//场景1: startTimeUtc和endTimeUtc在首月firstMonth
			perDiem.schFirstMonthPerDiemInSec = static_cast<int>(schEndTimeInUtc - schStartTimeInUtc);
		}
		else if (TimeUtils::IsSameMonth(schStartTimeInUtc, schFirstMonthStartTimeUtc, offsetTZMinutes) && !TimeUtils::IsSameMonth(schStartTimeInUtc, schEndTimeInUtc, offsetTZMinutes)) {
			//场景2: startTimeUtc在首月firstMonth，endTimeUtc在第二个月

			//"开始时间"和"结束时间"不在一个月，获得“结束时间”所在月份的第一个天0点（即所在月份开始时间）
			time_t schMonthStartInUtc = Utility::GetInstancePtr()->getLocalMonthStartInUTC(schEndTimeInUtc, offsetTZMinutes);
			perDiem.schFirstMonthPerDiemInSec = static_cast<int>(schMonthStartInUtc - schStartTimeInUtc);
		}

	}
	else if (ruleParam._perDiemExpression == "0") {
		perDiem.actPerDiemInSec = 0;
		perDiem.schPerDiemInSec = 0;
	}
	
	if (ruleParam._perDiemGapMinutes != 0 
		&& (mapPerDiemGap.find(ruleParam.GetRuleParamId()) == mapPerDiemGap.end())) {
		mapPerDiemGap.insert(std::make_pair(ruleParam.GetRuleParamId(), ruleParam._perDiemGapMinutes));
	}
	return perDiem;
}

string CalculatePairingPerDiemHoursForEvaFdRule::GetTimeType(const Duty* duty, const int offsetTZMinutes, const PairingPerDiemHoursForEvaFdRuleParam& ruleParam) const {
	if (ruleParam._perDiemDelayBuffer == RuleParamConstant::IGNORED) {
		return string("SCH");
	}
	//判断Duty最后航班落地时间是否延误，若延误大于30分钟，则采用实际时间来计算 实际PerDiem。
	bool isDelay = (int)(duty->getLastSegment()->getEndTimeUtcAct() - duty->getLastSegment()->getEndTimeUtcSch()) >= (ruleParam._perDiemDelayBufferMinutes * 60);
	return isDelay ? string("ACT") : string("SCH");
}

void CalculatePairingPerDiemHoursForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(PairingPerDiemHoursForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(PairingPerDiemHoursForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}