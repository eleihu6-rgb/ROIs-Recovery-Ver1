//
// Created by Yuhao Wang on 2025/12/3.
//

#ifndef PAIRINGOPTIMIZEPROJECT_DUTYCODEENUM_H
#define PAIRINGOPTIMIZEPROJECT_DUTYCODEENUM_H

#include <set>

namespace DutyCode{
    enum class DutyType {
        Empty = 0,
        Unknown,
        CommandingCaptain,
        AugmentingCaptain,
        CommandingFirstOfficer,
        AugmentingFirstOfficer,
        CommandingBasic,
        AugmentingBasic,
        Standby,
        Positioning,
        Deadhead,
        ReliefPilotInCruise
    };

    static const std::set FlyDutyType {
        DutyType::CommandingCaptain,
        DutyType::CommandingFirstOfficer,
        DutyType::CommandingBasic,
        DutyType::AugmentingCaptain,
        DutyType::AugmentingFirstOfficer,
        DutyType::AugmentingBasic,
        DutyType::ReliefPilotInCruise
    };

    static const std::unordered_map<std::string, DutyType> StringDutyTypeMap {
        {"Unknown", DutyType::Unknown},
        {"CommandingCaptain", DutyType::CommandingCaptain},
        {"AugmentingCaptain", DutyType::AugmentingCaptain},
        {"CommandingFirstOfficer", DutyType::CommandingFirstOfficer},
        {"AugmentingFirstOfficer", DutyType::AugmentingFirstOfficer},
        {"CommandingBasic", DutyType::CommandingBasic},
        {"AugmentingBasic", DutyType::AugmentingBasic},
        {"Standby", DutyType::Standby},
        {"Positioning", DutyType::Positioning},
        {"Deadhead", DutyType::Deadhead},
        {"RPIC", DutyType::ReliefPilotInCruise}
    };

    static const std::unordered_map<DutyType, std::string> DutyTypeStringMap {
            {DutyType::Unknown, "Unknown"},
            {DutyType::CommandingCaptain, "CommandingCaptain"},
            {DutyType::AugmentingCaptain, "AugmentingCaptain"},
            {DutyType::CommandingFirstOfficer, "CommandingFirstOfficer"},
            {DutyType::AugmentingFirstOfficer, "AugmentingFirstOfficer"},
            {DutyType::CommandingBasic, "CommandingBasic"},
            {DutyType::AugmentingBasic, "AugmentingBasic"},
            {DutyType::Standby, "Standby"},
            {DutyType::Positioning, "Positioning"},
            {DutyType::Deadhead, "Deadhead"},
            {DutyType::ReliefPilotInCruise, "RPIC"}
    };

    inline DutyType GetMappedDutyType(const std::string& string) {
        const auto cit = StringDutyTypeMap.find(string);
        if (cit == StringDutyTypeMap.end()) return DutyType::Empty;
        return cit->second;
    }
    inline std::string GetMappedString(const DutyType dutyType) {
        const auto cit = DutyTypeStringMap.find(dutyType);
        if (cit == DutyTypeStringMap.end()) return {};
        return cit->second;
    }
	
	/**
     * @brief 获取DutyType枚举对应的字符串（核心函数）
     * @param dutyType 枚举值
     * @return 对应的英文字符串（贴合航空业务术语）
     * @throw std::invalid_argument 传入无效枚举值时抛出异常
     */
    inline std::string dutyTypeToString(const DutyType dutyType) {
        // 枚举-字符串映射表（一对一精准对应）
        static const std::unordered_map<DutyType, std::string> dutyTypeMap = {
            {DutyType::Empty, "Empty"},
            {DutyType::Unknown, "Unknown"},
            {DutyType::CommandingCaptain, "CommandingCaptain"}, // 空格分隔更符合业务阅读习惯
            {DutyType::AugmentingCaptain, "AugmentingCaptain"},
            {DutyType::CommandingFirstOfficer, "CommandingFirstOfficer"},
            {DutyType::AugmentingFirstOfficer, "AugmentingFirstOfficer"},
            {DutyType::CommandingBasic, "CommandingBasic"},
            {DutyType::AugmentingBasic, "AugmentingBasic"},
            {DutyType::Standby, "Standby"},
            {DutyType::Positioning, "Positioning"},
            {DutyType::Deadhead, "Deadhead"},
            {DutyType::ReliefPilotInCruise, "ReliefPilotInCruise"}
        };

        // 查找映射，未找到则抛异常（保证健壮性）
        auto it = dutyTypeMap.find(dutyType);
        if (it != dutyTypeMap.end()) {
            return it->second;
        }
        //throw std::invalid_argument("Invalid DutyType enum value");
        return "Empty";
    }
}


#endif //PAIRINGOPTIMIZEPROJECT_DUTYCODEENUM_H