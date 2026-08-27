/**
 * @file CalculationOfOffDutyPeriodRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CALCULATIONOFOFFDUTYPERIODRULEPARAM_H_
#define _CALCULATIONOFOFFDUTYPERIODRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculationOfOffDutyPeriodRule;

class CalculationOfOffDutyPeriodRuleParam : public RuleParam {
friend class CalculationOfOffDutyPeriodRule;
private:
    explicit CalculationOfOffDutyPeriodRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6100;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 21;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		DUTY_ASSIGNMENTS = 3,
		DUTY_TZ_DIFF = 4,
		SECTOR_BLH_RANGES = 5,
		ENCROACH_TIME_RANGES = 6,
		IS_HOME_BASE = 7,
		ACCLIMATIZED_STATE = 8,
		DO_ASSIGNMENT_GROUPS = 9,//废弃
		UTILIZE_POST_DUTY_REST = 10,//废弃
		COUNT_BLANK_DAY = 11,//废弃
		ULTILIZE_LAYOVER = 12,//废弃
		BENCHMARK = 13,
		FDP_THRESHOLD = 14,//废弃
		PERIOD_THRESHOLD = 15,
		REST_TIME = 16,
		FDP_EXCEEDED_HOURS = 17, //废弃
		FDP_TIMES = 18,
		DIRECTION = 19,
		DISPLACEMENT_ADJUSTMENT_REFERENCE_TIME = 20,
		SEVERITY = 21
    };

	//所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//Duty任务类型,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	vector<string> _dutyAssignments{};

	//Duty跨过时区范围,格式：HH:mm-HH:mm,例如：00:00-12:00。。支持*表示忽略该参数
	string _dutyTzDiff{};
	int _dutyTzDiffMinutesLower{ INT_MIN };
	int _dutyTzDiffMinutesUpper{ INT_MAX };

	//航段的飞时范围,格式：HH:mm-HH:mm,例如：00:00-12:00。Duty的任意飞行航段满足该条件即可。支持*表示忽略该参数
	string _sectorBlhRanges{};
	int _sectorBlhRangesMinutesLower{ INT_MIN };
	int _sectorBlhRangesMinutesUpper{ INT_MAX };

	//Duty开始时间侵犯的时间段,格式：HH:mm-HH:mm,例如：00:20-05:59。Duty开始时间侵犯的时间段,支持*表示忽略该参数
	string _encroachTimeRanges{};
	int _encroachTimeRangesMinutesLower{ INT_MIN };
	int _encroachTimeRangesMinutesUpper{ INT_MAX };

	//是否在基地,
	std::unique_ptr<bool> _isHomeBase{nullptr};
	//是否适应期,
	string _acclimatizedState{};
	//休息日类任务所属任务组,加入休息的任务组
	std::vector<std::string> _dayOffAssignmentGroups{};
	//航后休息是否计入休息,
	bool _isUtilizePostDutyRest{true};
	//空白天是否计入休息,
	bool _isCountBlankDay{true};
	//过夜是否计入休息（过夜是指Duty之间休息时长）,
	bool _isUltilizeLayover{true};

	//计算基准,取值：DP- 通过Duty Period计算MinRest,FDP - 通过FDP计算MinRest。配置*默认表示FDP
	string _benchmark;

	//FDP或DP周期阈值时长（分钟）,格式：HH:mm。例如：12:00，表示12小时
	std::string _periodThredhold{};
	int _periodThredholdMinutesLower{};
	int _periodThredholdMinutesUpper{};
	//休息时长（小时）,格式：HH:mm。例如：12:00，表示12小时
	std::string _restTime{};
	int _restTimeMinutes{}; //休息时长分钟数
	////FDP超过小时数,例如：12
	//std::string _fdpExceededHours{};
	//int _fdpExceededMinutes{};
	//FDP扣除fdpExceededHours之后的倍数,例如：1.5。_fdpExceededHours与fdpThredhold时间相同
	double _fdpTimes{};
	//飞行方向,取值：W-向西，E-向东
	std::string _direction{};
	//位移调整参考时间（小时数）,格式：±HH:mm。例如： - 03:00，表示负3小时
	std::string _displaceAdjustReferTime{};
	std::unique_ptr<int> _displaceAdjustReferTimeMinutes{nullptr};  //位移调整参考时间分钟数


    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	//判断Duty是否满足任务类型
	bool MatchDutyAssignments(const Duty& duty) const;

	//判断Duty跨时区是否满足任务类型
	bool MatchDutyTzDiff(const Duty& duty) const;

	//判断Sector飞时
	bool MatchSectorBlhRanges(const Duty& duty) const;

	//判断Segment飞行时间段侵犯的时间段
	bool MatchEncroachTimeRanges(const Segment* segment) const;

	//判断是否在基地
	bool MatchHomeBase(const Duty& duty, const std::string& base, const SharedPtr<CrewDataContext>& dbData) const;

	//判断是否在适应期
	bool MatchAcclimatizedState(const Duty* currDuty) const;

	//判断是否匹配位移方向
	bool MatchDirection(const string& direction) const;

	//判断是否匹配
	bool MatchFDPThredhold(const Duty& duty, const int dutyFdpMinutes) const;
};

#endif //_CALCULATIONOFOFFDUTYPERIODRULEPARAM_H_
