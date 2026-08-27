/**
 * @file CalculateFdpExtensionForHXRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2026-02-12
**/

#ifndef _CALCULATEFDPEXTENSIONFORHXRULEPARAM_H_
#define _CALCULATEFDPEXTENSIONFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <vector>
#include <limits>

class CalculateFdpExtensionForHXRule;

class CalculateFdpExtensionForHXRuleParam : public RuleParam {
	friend class CalculateFdpExtensionForHXRule;
private:
	explicit CalculateFdpExtensionForHXRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7490;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 8;

	enum class ParamLocation {
		COMPOSITIONS = 0,
		PRE_REST_DURATION = 1,
		SINGLE_FLY_SECTOR_BLH_RANGE = 2,
		REST_FACILITY = 3,
		TOTAL_INFLIGHT_REST_DURATION = 4,
		MIN_CONCURRENT_CREW_ON_BOARD = 5,
		MAX_CONTINUOUS_WORKING_TIME = 6,
		MAX_WORKING_TIME = 7,
		EXTEND_FDP_PCT = 8,
		MAX_FDP = 9,
		EACH_ADDITIONAL_FLY_SECTOR_MAX_FDP_REDUCED_HRS = 10,
		CALC_RULE = 11
	};

	std::string _compositionsStr{};
	std::vector<std::string> _compositions;

	//前一个Duty的休息时长。格式：HH:mm-HH:mm，取值范围：[n,m]。支持*通配表示忽略边界
	std::string _preRestDuration{};
	int _preRestDurationMinutesLower{};
	int _preRestDurationMinutesUpper{};
	bool _preRestDurationMinutesLowerIgnored{false};
	bool _preRestDurationMinutesUpperIgnored{false};

	//单个航班的飞时范围。格式：HH:mm-HH:mm，取值范围：[n,m]。支持*通配表示忽略
	std::string _singleFlySectorBlhRange{};
	int _singleFlySectorBlhRangeLower{};
	int _singleFlySectorBlhRangeUpper{};

	//休息设施
	std::string _restFacilityStr{};
	int _restFacility{};

	//飞行中总休息时长。格式：HH:mm-HH:mm，取值范围：[n,m]。支持*通配表示忽略
	std::string _totalInflightRestDuration{};
	int _totalInflightRestDurationMinutesLower{};
	int _totalInflightRestDurationMinutesUpper{};

	//机上最少同时在线的机组成员数
	std::string _minConcurrentCrewOnBoardStr{};
	int _minConcurrentCrewOnBoard{};

	//连续工作时间上限。格式：HH:mm,支持*通配表示忽略
	std::string _maxContinuousWorkingTime{};
	int _maxContinuousWorkingTimeMinutes{};

	//工作时间上限。格式：HH:mm,支持*通配表示忽略
	std::string _maxWorkingTime{};
	int _maxWorkingTimeMinutes{};

	//延长FDP的百分比。格式：分数，ex: 1/2 or 1/3
	std::string _extendFdpPctStr{};
	double _extendFdpPct{};

	//最大FDP。格式：HH:mm,支持*通配表示忽略
	std::string _maxFdp{};
	int _maxFdpMinutes{};

	//每增加一个飞行航段，最大FDP减少的时长。格式：HH:mm,支持*通配表示忽略
	std::string _eachAdditionalFlySectorMaxFdpReducedHrs{};
	int _eachAdditionalFlySectorMaxFdpReducedHrsMinutes{};

	//计算规则
	std::string _calcRule{};


	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);
private:
	bool MatchParam(const Duty* duty, const time_t checkStart, const time_t checkEnd) const;

	bool MatchComposition(const Duty* duty) const;

	bool MatchPreRest(const time_t checkStart, const time_t checkEnd) const;

	bool MatchSingleFlySectorBlhRange(const Duty* duty) const;

	bool MatchRestFacility(const Duty* duty) const;

	int CalculateCrewMaxRestMinutes(const int maxWorkingTimeInFlight, const int flightTime, const int crewNum, const int restFacility) const;

	int GetCrewNumber(const Segment* segment) const;

	int GetFacilityNumber(const Segment* segment) const;

	int GetMaxFdp(const Duty* duty, int maxFdp) const;
};

#endif //_CalculateFdpExtensionForHXRulePARAM_H_
