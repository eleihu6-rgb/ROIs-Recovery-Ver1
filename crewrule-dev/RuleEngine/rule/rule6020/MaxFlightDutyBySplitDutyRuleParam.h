/**
 * @file MaxFlightDutyBySplitDutyRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _MAXFLIGHTDUTYBYSPLITDUTYRULEPARAM_H_
#define _MAXFLIGHTDUTYBYSPLITDUTYRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"
#include <string>
#include <limits>

class CalculateMaxFlightDutyBySplitDutyRule;
class CheckMaxFlightDutyBySplitDutyRule;

class MaxFlightDutyBySplitDutyRuleParam : public RuleParam {
friend class CalculateMaxFlightDutyBySplitDutyRule;
friend class CheckMaxFlightDutyBySplitDutyRule;
friend class CalculateDutyDpInMandayRule;
private:
    explicit MaxFlightDutyBySplitDutyRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6020;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 12;

    enum class ParamLocation {
		INCLUDE_SPLIT_DUTY_PERIOD_RANGES = 0,
		EXCLUDE_SPLIT_DUTY_PERIOD_RANGES = 1,
		STATION_REST_FACILTY = 2,
		SPLIT_DUTY_REST_DURATION_RANGES = 3,
		MIN_SPLIT_REST = 4,
		INCREASE_IN_FDP = 5,
		PERCENT_INCREASE_IN_FDP = 6,
		MAX_INCREASE_IN_FDP = 7,
		MAX_FDP = 8,
		MAX_FDP_AFTER_SPLIT_DUTY_REST_PERIOD = 9,
		DELTA_FDP_AFTER_REST = 10,
		SEVERITY = 11
    };

	//包含过站休息时间段范围,格式：HH:mm-HH:mm。例如：23:00 - 05 : 30，表示与[23:00, 05 : 30)任意时间部分相交
	std::string _includeSplitDutyPeriodRanges{};
	int _includeSplitDutyPeriodMinutesLower{};
	int _includeSplitDutyPeriodMinutesUpper{};
	//不包含过站休息时间段范围,格式：HH:mm-HH:mm。例如：23:00-05:30，表示 不在[23:00, 05:30)范围内，时间不相交
	std::string _excludeSplitDutyPeriodRanges{};
	int _excludeSplitDutyPeriodMinutesLower{};
	int _excludeSplitDutyPeriodMinutesUpper{};
	//FDP机场(落地)休息设施等级,休息设施等级：取值：S-Sleep睡眠设施、R-Rest休息设施，S等级高于R，即满足S肯定满足R
	std::string _stationRestFacilty{};
	//过站休息时长(分钟数),格式：HH:mm-HH:mm，例如：02:00-04:00，表示[2小时,4小时)
	std::string _splitRestDurationRanges{};
	int _splitRestDurationMinutesLower{};
	int _splitRestDurationMinutesUpper{};
	//Split Duty中转最小休息时长,格式：HH:mm。例如：07:00，表示07时0分
	std::string _minSplitRest{};
	int _minSplitRestMinutes{};//最小休息ODP时长分钟数
	//增加FDP时长,格式：HH:mm。例如：04:00，表示04时0分。与percentIncreaseInFDP二选一
	std::string _increaseInFDP{};
	int _increaseInFDPMinutes{};//增加FDP时长分钟数
	//相对于过站时长FDP增长比例,例如：0.5，表示50%
	double _percentIncreaseInFDP{};
	//增加FDP最大时长,格式：HH:mm。例如：02:00，表示02时0分
	std::string _maxIncreaseInFDP{};
	int _maxIncreaseInFDPMinutes{}; //增加FDP最大时长分钟数
	//最大FDP时长(分钟数),格式：HH:mm。例如：16:00，表示16时0分
	std::string _maxFDP{};
	int _maxFDPMinutes{}; //最大FDP时长(分钟数)
	//过站之后FDP最小时长（分钟）,格式：HH:mm。例如：07:00，表示7时0分
	std::string _maxFDPAfterTransit{};
	int _maxFDPAfterTransitMinutes{};
	//休息后对FDP影响差值(分钟数）.6100法规使用
	std::string _deltaFDPAfterRest{};
	int _deltaFDPMinutesAfterRest{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断航班过站休息时间段是否满足“包含过站时间段范围”
	bool MatchIncludeSplitDutyPeriodRanges(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit) const;

	//判断航班过站休息时间段是否满足“不包含过站时间段范围”
	bool MatchExcludeSplitDutyPeriodRanges(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit) const;
	
	//判断航班落地机场的休息设施等级是否满足
	bool MatchStationRestFacilty(const Segment* currSegment) const;

	//判断航班过站休息时长是否满足“过站休息时长(分钟数)”
	bool MatchSplitRestDurationRanges(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit) const;

	/**
	* 判断长中转之后剩余FDP是否满足要求
	* @param nextSegment Duty当前正在检查的Segment的后续Segment（后续航班）
	* @param duty 当前正常检查的segment所属Duty
	* @return true-合规，false-不合规
	*/
	bool MatchMinFDPAfterTransit(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const Duty* duty) const;

	/**
	* @param currSegment Duty当前正在检查的Segment
	* @param nextSegment Duty当前Segment的下一个Segment
	* @return true-合规，false-不合规
	*/
	bool MatchMinSplitRest(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit) const;


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
		MIN_FDP_AFTER_TRANSIT_WARN = 1, //长中转之后剩余FDP不满足的告警
		MIN_SPLIT_REST_WARN = 2 //Split Duty的Rest时长不满足的告警
	};


	//匹配参数
	bool MatchParam(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const Duty* duty) const;

	//检查规则使用的匹配参数
	bool MatchParamByCheck(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const Duty* duty) const;

	/**
	* @param nextSegment Duty当前正在检查的Segment的后续Segment（后续航班）
	* @param duty 当前正常检查的segment所属Duty
	* @return true-合规，false-不合规
	*/
	int CheckRule(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const Duty* duty) const;


};

#endif //_MAXFLIGHTDUTYBYSPLITDUTYRULEPARAM_H_
