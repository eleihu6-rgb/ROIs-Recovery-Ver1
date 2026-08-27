//
// Created by Yuhao Wang on 2025/12/3.
//

#ifndef PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODEOPTIONROW_H
#define PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODEOPTIONROW_H

#include <map>
#include <string>
#include "DutyCodeEnum.h"

namespace DutyCode {
    class DutyCodeOptionRow {
    public:
        explicit DutyCodeOptionRow(const std::map<std::string, int>& pairingComplement): _pairingComplement(pairingComplement) {}

        void PushDutyCode(const DutyType dutyType, const std::string& dutyCode) {
            _dutyTypeToDutyCode.insert({dutyType, dutyCode});
        }

        [[nodiscard]] bool CheckIfPairingComplementMatch(const std::map<std::string, int>& pairingComplement) const {
            return pairingComplement == _pairingComplement;
        }
        [[nodiscard]] const std::map<DutyType, std::string>& GetDutyCodeRowDetail() const { return _dutyTypeToDutyCode; }
    private:
        std::map<std::string, int> _pairingComplement;
        std::map<DutyType, std::string> _dutyTypeToDutyCode;
    };
}

#endif //PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODEOPTIONROW_H