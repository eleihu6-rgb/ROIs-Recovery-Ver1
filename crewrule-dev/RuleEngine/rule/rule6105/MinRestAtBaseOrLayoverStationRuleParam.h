/**
 * @file MinRestAtBaseOrLayoverStationRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _MINRESTATBASEORLAYOVERSTATIONRULEPARAM_H_
#define _MINRESTATBASEORLAYOVERSTATIONRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class MinRestAtBaseOrLayoverStationRule;

class MinRestAtBaseOrLayoverStationRuleParam : public RuleParam {
friend class CalculateMinRestAtBaseOrLayoverStationRule;
friend class CheckMinRestAtBaseOrLayoverStationRule;
private:
    explicit MinRestAtBaseOrLayoverStationRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6105;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 13;

    enum class ParamLocation {
		COMPOSITIONS = 0,
		ASSIGNMENTS = 1,
		BASES = 2,
		REST_BUNK = 3,
		SEGMENTS = 4,
		BLH_RANGES = 5,
		FDP_RANGES = 6,
		IS_CROSS_MIDNIGHT = 7,
		IS_DELAY = 8,
		LAYOVER_STATIONS = 9,
		MIN_REST_AT_BASE = 10,
		MIN_REST_AT_LAYOVER = 11,
		SEVERITY = 12
    };

	//配比名称,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::vector<std::string> _compositions{};
	//任务类型,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::vector<std::string> _assignments{};
	//基地列表,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::vector<std::string> _bases{};
	//休息区,0：无休息区；1：一级休息区；2：二级休息区
	std::unique_ptr<int> _restBunk{nullptr};
	//执勤期包含航段数范围,格式：min-max，例如：0-99
	std::string _segments{};
	int _segmentsLower{ INT_MIN };
	int _segmentsUpper{ INT_MAX };
	//执勤期的飞行时间范围,格式：HH:mm-HH:mm，例如：00:00-12:00
	std::string _blhRanges{};
	int _blhRangesMinutesLower{ INT_MIN };
	int _blhRangesMinutesUpper{ INT_MAX };
	//执勤期的执勤时间范围,格式：HH:mm-HH:mm，例如：00:00-12:00
	std::string _fdpRanges{};
	int _fdpRangesMinutesLower{ INT_MIN };
	int _fdpRangesMinutesUpper{ INT_MAX };
	//是否跨零点,Y：表示true，N：表示false
	std::unique_ptr<bool> _isCrossMidnight{nullptr};
	//是否延误,Y：表示true，N：表示false
	std::unique_ptr<bool> _isDelay{nullptr};
	//过夜站点列表,支持多个通过“|”分隔表示OR关系，支持通配符“*”表示所有
	std::vector<std::string> _layoverStations{};
	//基地最小休息期(时分),在基地休息时长,支持通配符“*”表示空(忽略该配置)。格式：HH:mm, 例如：22:00，表示22时0分
	std::unique_ptr<int> _minRestAtBase{nullptr};
	//过夜最小休息期,在外站过夜休息时长,支持通配符“*”表示空(忽略该配置)。格式：HH:mm，例如：22:00，表示22时0分
	std::unique_ptr<int> _minRestAtLayover{nullptr};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchComposition(const Duty& duty) const;

	bool MatchAssignment(const Duty& duty) const;

	bool MatchHomeBase(const Duty& duty, const std::string& base) const;

	bool MatchRestBunkAndSegmentsAndDelay(const Duty& duty) const;

	bool MatchBLHRanges(const Duty& duty) const;

	bool MatchFDPRanges(const Duty& duty, const map<long long, long>& mapCallinSBY_FDPMins) const;

	bool MatchCrossMidnight(const Duty& duty) const;

	bool MatchLayoverStation(const Duty& duty) const;

	bool MatchRule(const Duty& duty, const map<long long, long>& mapCallinSBY_FDPMins) const;

	bool CheckMinRestAtBase(const Duty* currDuty, const Duty* nextDuty, const int restDiscretion) const;

	bool CheckMinRestAtLayover(const Duty* currDuty, const Duty* nextDuty, const int restDiscretion) const;

	//获得Standby(SBY与FLY重叠)抓飞扩展FDP
	long GetCallinSBY_FDPMins(const Duty& duty, const map<long long, long>& mapCallinSBY_FDPMins) const;
};

#endif //_MINRESTATBASEORLAYOVERSTATIONRULEPARAM_H_
