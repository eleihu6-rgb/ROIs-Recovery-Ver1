//
// Created by haoli on 2025/8/19.
//

#ifndef TRAININGOPTIMIZER_CONVERTERHELPER_H
#define TRAININGOPTIMIZER_CONVERTERHELPER_H

#include "CrewDB.h"

template<typename SourceType, typename TargetType>
struct ConverterHelper {
    static TargetType *Convert(const SourceType &src) {
        throw std::runtime_error("Conversion not implemented");
    }
};


#endif //TRAININGOPTIMIZER_CONVERTERHELPER_H
